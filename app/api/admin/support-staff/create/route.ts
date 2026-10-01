import { z } from "zod";
import { requireInternal } from "@/lib/server/access";
import { json } from "@/lib/server/http";
import { validPushOrigin } from "@/lib/server/push-origin";
import { publicOrigin } from "@/lib/server/public-origin";
import { supportError } from "@/lib/server/support-errors";
import { supportPermissions } from "@/lib/support";
const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      name: z.string().trim().min(2).max(100),
      email: z.string().trim().email().max(254),
      permissions: z
        .array(z.enum(supportPermissions))
        .max(6)
        .refine((p) => p.includes("view")),
    })
    .strict(),
  z.object({ action: z.literal("reissue"), id: z.string().uuid() }).strict(),
]);
export async function POST(request: Request) {
  try {
    if (!validPushOrigin(request, process.env.NEXT_PUBLIC_APP_URL))
      return json({ error: "عنوان الطلب غير مسموح" }, 403);
    const { supabase } = await requireInternal(["SUPER_ADMIN"]);
    const input = schema.parse(await request.json());
    const { data, error } = await supabase.functions.invoke(
      "support-staff-provision",
      { body: input },
    );
    if (error) {
      let code = "";
      try {
        code = (await error.context?.json())?.error ?? "";
      } catch {}
      const messages: Record<string, string> = {
        EMAIL_EXISTS:
          "البريد مستخدم من قبل. استخدم ربط حساب موجود بدل إنشاء حساب جديد.",
        ALREADY_ACTIVATED:
          "الموظف فعّل حسابه بالفعل؛ لا يمكن إصدار رابط تفعيل جديد.",
        LINK_FAILED:
          "تم إنشاء الموظف لكن تعذر إصدار الرابط. استخدم زر إصدار رابط التفعيل في قائمة الفريق.",
        FORBIDDEN: "ليس لديك صلاحية لإنشاء الموظفين.",
        CREATE_FAILED: "تعذر إنشاء الحساب. قد يكون البريد مستخدماً بالفعل.",
      };
      return json(
        {
          error:
            messages[code] ??
            "تعذر تجهيز حساب الدعم. حدّث القائمة قبل المحاولة مجدداً.",
        },
        code === "FORBIDDEN" ? 403 : 400,
      );
    }
    const activationUrl = new URL("/staff/activate", publicOrigin(request));
    activationUrl.hash = new URLSearchParams({
      token_hash: data.tokenHash,
    }).toString();
    return json(
      { ok: true, id: data.id, activationUrl: activationUrl.toString() },
      201,
    );
  } catch (error) {
    return supportError(error);
  }
}
