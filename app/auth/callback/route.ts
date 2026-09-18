import { createHash } from "node:crypto";
import { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";

const allowedTypes = new Set<EmailOtpType>(["email", "magiclink", "recovery", "invite", "email_change", "signup"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextParam = url.searchParams.get("next");
  const next = nextParam?.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createServerSupabase();

  let error = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type && allowedTypes.has(type)) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  else error = new Error("Missing authentication parameters");

  if (error) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", "email_link");
    return NextResponse.redirect(login);
  }
  const cookieStore = await cookies();
  const inviteToken = cookieStore.get("dorni_partner_invite")?.value;
  if (inviteToken) {
    const tokenHash = createHash("sha256").update(inviteToken).digest("hex");
    const claim = await supabase.rpc("claim_partner_invitation", { p_token_hash: tokenHash });
    if (claim.error) {
      const login = new URL("/login", url.origin);
      login.searchParams.set("error", "partner_invite");
      return NextResponse.redirect(login);
    }
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata?.account_type === "partner") {
      const registration = await supabase.rpc("register_my_partner_organization", {
        p_name: user.user_metadata.company_name,
        p_type: user.user_metadata.company_type ?? "CORPORATE",
        p_registration_number: user.user_metadata.registration_number ?? null,
      });
      if (registration.error) {
        const login = new URL("/login", url.origin);
        login.searchParams.set("error", "partner_registration");
        return NextResponse.redirect(login);
      }
    }
  }
  const response = NextResponse.redirect(new URL(inviteToken ? "/partner" : next, url.origin));
  if (inviteToken) response.cookies.delete("dorni_partner_invite");
  return response;
}
