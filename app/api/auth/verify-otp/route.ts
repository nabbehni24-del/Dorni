import { body, json } from "@/lib/server/http";
import { normalizeLibyanPhone } from "@/lib/server/security";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { phone, code } = await body<{ phone?: string; code?: string }>(request);
    const normalized = normalizeLibyanPhone(phone ?? "");
    if (!/^\d{6}$/.test(code ?? "")) return json({ error: "الرمز يجب أن يكون 6 أرقام" }, 400);
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.verifyOtp({ phone: normalized, token: code!, type: "sms" });
    if (error || !data.user) return json({ error: "الرمز غير صحيح أو منتهي" }, 400);
    return json({ user: { id: data.user.id, phone: data.user.phone } });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "تعذر تسجيل الدخول" }, 400); }
}
