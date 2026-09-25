import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { json } from "@/lib/server/http";
import { publicOrigin } from "@/lib/server/public-origin";

const schema = z.object({ email: z.string().trim().email().max(254) });

export async function POST(request: Request) {
  try {
    const { email } = schema.parse(await request.json());
    const supabase = await createServerSupabase();
    const callbackUrl = new URL("/auth/callback", publicOrigin(request));
    callbackUrl.searchParams.set("next", "/app");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase(),
      options: { shouldCreateUser: true, emailRedirectTo: callbackUrl.toString() },
    });
    if (error) throw error;
    return json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "اكتب بريداً إلكترونياً صحيحاً" }, 400);
    console.error("Email login request failed", error);
    return json({ error: "تعذر إرسال رابط الدخول. حاول مرة ثانية بعد قليل." }, 500);
  }
}

