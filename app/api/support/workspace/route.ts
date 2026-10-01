import { z } from "zod";
import { requireInternal } from "@/lib/server/access";
import { json } from "@/lib/server/http";
import { validPushOrigin } from "@/lib/server/push-origin";
import { supportError } from "@/lib/server/support-errors";
import { supportMutation, ticketStatuses } from "@/lib/support";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireInternal(["SUPER_ADMIN", "SUPPORT"]);
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    const query = id ? { id: z.string().uuid().parse(id), before: z.string().uuid().optional().parse(params.get("before") ?? undefined) } : {
      page: z.coerce.number().int().min(0).max(10000).parse(params.get("page") ?? 0),
      search: z.string().max(160).parse(params.get("search") ?? ""),
      status: z.enum(["", ...ticketStatuses]).parse(params.get("status") ?? ""),
    };
    const { data, error } = await supabase.rpc("support_workspace", { p_action: id ? "thread" : "list", p_data: query });
    if (error) throw error;
    return json(data);
  } catch (error) { return supportError(error); }
}
export async function POST(request: Request) {
  try {
    if (!validPushOrigin(request, process.env.NEXT_PUBLIC_APP_URL)) return json({ error: "عنوان الطلب غير مسموح" }, 403);
    const { supabase } = await requireInternal(["SUPER_ADMIN", "SUPPORT"]);
    const input = supportMutation.parse(await request.json());
    const { data, error } = await supabase.rpc("support_workspace", { p_action: input.action, p_data: input.data });
    if (error) throw error;
    return json(data);
  } catch (error) { return supportError(error); }
}
