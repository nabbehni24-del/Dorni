import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { validPushOrigin } from "@/lib/server/push-origin";
import { json } from "@/lib/server/http";
const schema = z
  .object({
    tokenHash: z.string().min(32).max(512),
    password: z
      .string()
      .min(8)
      .max(128)
      .regex(/[A-Za-z]/)
      .regex(/\d/),
  })
  .strict();
export async function POST(request: Request) {
  if (!validPushOrigin(request, process.env.NEXT_PUBLIC_APP_URL))
    return json({ error: "عنوان الطلب غير مسموح" }, 403);
  try {
    const value = schema.parse(await request.json());
    const supabase = await createServerSupabase();
    const verified = await supabase.auth.verifyOtp({
      token_hash: value.tokenHash,
      type: "invite",
    });
    if (verified.error)
      return json(
        {
          error:
            "رابط التفعيل غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً من الأدمن.",
        },
        400,
      );
    const role = await supabase.rpc("get_my_internal_role");
    if (role.error || role.data !== "SUPPORT") {
      await supabase.auth.signOut({ scope: "local" });
      return json({ error: "تم إيقاف صلاحية الدعم لهذا الحساب." }, 403);
    }
    const changed = await supabase.auth.updateUser({
      password: value.password,
    });
    if (changed.error)
      return json(
        {
          error:
            "تم تأكيد الحساب لكن تعذر حفظ كلمة المرور. افتح صفحة تغيير كلمة المرور من الجلسة الحالية.",
        },
        400,
      );
    return json({ ok: true });
  } catch {
    return json(
      {
        error:
          "راجع البيانات: كلمة المرور 8 أحرف على الأقل وبها حرف إنجليزي ورقم.",
      },
      400,
    );
  }
}
