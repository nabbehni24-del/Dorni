import { body, json } from "@/lib/server/http";
import { normalizeLibyanPhone } from "@/lib/server/security";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { phone } = await body<{ phone?: string }>(request);
    const normalized = normalizeLibyanPhone(phone ?? "");
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized, options: { shouldCreateUser: true } });
    if (error) return json({ error: error.status === 429 ? "استنى شوية قبل طلب رمز جديد" : "تعذر إرسال رمز الدخول" }, error.status ?? 400);
    return json({ phone: normalized, expiresInSeconds: 300 });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "بيانات غير صالحة" }, 400); }
}
