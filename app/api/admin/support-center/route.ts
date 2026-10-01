import { requireInternal } from "@/lib/server/access";
import { json } from "@/lib/server/http";
import { validPushOrigin } from "@/lib/server/push-origin";
import { supportError } from "@/lib/server/support-errors";
import { supportCenterSchema } from "@/lib/support-center";
export async function GET() {
  try {
    const { supabase } = await requireInternal(["SUPER_ADMIN"]);
    const { data, error } = await supabase.rpc("support_center_admin", { p_action: "get" });
    if (error) throw error;
    return json(data);
  } catch (e) { return supportError(e); }
}
export async function POST(request: Request) {
  try {
    if (!validPushOrigin(request, process.env.NEXT_PUBLIC_APP_URL)) return json({ error: "عنوان الطلب غير مسموح" }, 403);
    const { supabase } = await requireInternal(["SUPER_ADMIN"]);
    const input = supportCenterSchema.parse(await request.json());
    const { data, error } = await supabase.rpc("support_center_admin", { p_action: "save", p_data: input });
    if (error) throw error;
    return json(data);
  } catch (e) { return supportError(e); }
}
