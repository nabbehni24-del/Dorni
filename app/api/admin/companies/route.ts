import { z } from "zod";
import { requireInternal } from "@/lib/server/access";
import { json } from "@/lib/server/http";
import { validPushOrigin } from "@/lib/server/push-origin";
import { supportError } from "@/lib/server/support-errors";
const schema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["ACTIVE", "SUSPENDED", "REJECTED"]),
    trustedGeneration: z.boolean(),
    limit: z.number().int().min(1).max(100000),
    note: z.string().trim().max(1000),
  })
  .strict();
export async function POST(request: Request) {
  try {
    if (!validPushOrigin(request, process.env.NEXT_PUBLIC_APP_URL))
      return json({ error: "عنوان الطلب غير مسموح" }, 403);
    const { supabase } = await requireInternal(["SUPER_ADMIN"]);
    const input = schema.parse(await request.json());
    const { data, error } = await supabase.rpc("admin_set_partner_status", {
      p_organization_id: input.id,
      p_status: input.status,
      p_trusted_generation: input.trustedGeneration,
      p_generation_limit: input.limit,
      p_note: input.note,
    });
    if (error) throw error;
    return json({ ok: true, organization: data });
  } catch (error) {
    return supportError(error);
  }
}
