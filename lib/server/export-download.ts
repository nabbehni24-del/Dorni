import type { createServerSupabase } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import { json } from "@/lib/server/http";

type Client = Awaited<ReturnType<typeof createServerSupabase>>;

// Never expose Storage URLs: authorization and expiry are checked on each download.
export async function exportDownload(request: Request, id: string, authorize: () => Promise<{ supabase: Client }>) {
  const unavailable = () => json({ error: "ملف التصدير منتهي أو غير موجود" }, 404);
  const read = async (supabase: Client) => {
    const { data, error } = await supabase.from("production_exports")
      .select("id,batch_id,storage_path,expires_at").eq("id", id).single();
    if (error || !data || !Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= Date.now()) return null;
    return data;
  };
  const { supabase } = await authorize();
  const row = await read(supabase);
  if (!row) return unavailable();
  const url = new URL(request.url);
  if (url.searchParams.get("download") !== "1") return json({ url: url.pathname + "?download=1" });
  const { data, error } = await supabase.storage.from("production-exports").download(
    row.storage_path, { cacheNonce: randomUUID() },
    { cache: "no-store", signal: AbortSignal.timeout(30_000) },
  );
  if (error || !data || data.size > 10 * 1024 * 1024) return json({ error: "تعذر تنزيل التصدير، حاول مجددًا" }, 502);
  // Access may change while Storage is responding; fail closed before releasing bytes.
  const current = await authorize();
  const latest = await read(current.supabase);
  if (!latest || latest.storage_path !== row.storage_path || latest.batch_id !== row.batch_id) return unavailable();
  await current.supabase.from("production_exports").update({ downloaded_at: new Date().toISOString() }).eq("id", id);
  if (Date.parse(latest.expires_at) <= Date.now()) return unavailable();
  const filename = String(row.batch_id).replace(/[^a-zA-Z0-9_-]/g, "");
  return new Response(data, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="dorni-' + filename + '.csv"',
    "Cache-Control": "private, no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Vary": "Cookie, Authorization",
    "X-Content-Type-Options": "nosniff",
  } });
}
