import { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { publicOrigin } from "@/lib/server/public-origin";

const recoveryTypes = new Set<EmailOtpType>(["recovery"]);

function loginError(origin: string) {
  const login = new URL("/login", origin);
  login.searchParams.set("error", "email_link");
  return NextResponse.redirect(login);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(request);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createServerSupabase();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return loginError(origin);
  } else if (tokenHash && type && recoveryTypes.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return loginError(origin);
  } else {
    // Some mail clients reopen the app after Supabase has already established
    // the recovery session. Keep that valid session instead of discarding it.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return loginError(origin);
  }

  return NextResponse.redirect(new URL("/reset-password", origin));
}

