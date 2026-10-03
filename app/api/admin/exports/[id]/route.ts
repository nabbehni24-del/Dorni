import { exportDownload } from "@/lib/server/export-download";
import { json, UnauthorizedError } from "@/lib/server/http";
import { ForbiddenError, requireInternal } from "@/lib/server/access";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authorize = () => requireInternal(["SUPER_ADMIN", "OPERATIONS", "CODE_PRODUCTION"]);
    const response = await exportDownload(request, id, authorize);
    if (response.status === 200 && new URL(request.url).searchParams.get("download") === "1") {
      const { user, supabase } = await authorize();
      await supabase.from("audit_logs").insert({
        actor_id: user.id, actor_kind: "ADMIN", action: "PRODUCTION_EXPORT_ACCESSED",
        entity_type: "production_export", entity_id: id,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof ForbiddenError) return json({ error: "FORBIDDEN" }, 403);
    return json({ error: error instanceof UnauthorizedError ? "UNAUTHORIZED" : "تعذر تجهيز التصدير" }, error instanceof UnauthorizedError ? 401 : 500);
  }
}
