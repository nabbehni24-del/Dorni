"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { DorniBrand } from "@/components/dorni-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestLink(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/request-email-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setError(data.error);
    setSent(true);
  }

  return <main className="auth-shell" dir="rtl">
    <header><DorniBrand/><span className="secure-chip"><ShieldCheck/> خصوصيتك محفوظة</span></header>
    <section className="auth-card">
      <span className="auth-icon"><Mail/></span>
      <p className="eyebrow">حساب صاحب السيارة</p>
      <h1>{sent ? "راجع بريدك الإلكتروني" : "ادخل إلى حسابك"}</h1>
      <p>{sent ? `بعثنا رابط دخول آمن إلى ${email}. افتح الرسالة واضغط الرابط لإكمال الدخول.` : "اكتب بريدك الإلكتروني ونبعث لك رابط دخول آمن، من غير كلمة مرور."}</p>
      {!sent ? <form onSubmit={requestLink}>
        <label className="auth-field">
          <span>البريد الإلكتروني</span>
          <div><Input dir="ltr" type="email" placeholder="name@example.com" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" required/></div>
        </label>
        <Button className="primary-action" type="submit" disabled={busy||!email.includes("@")}>{busy ? "جاري الإرسال..." : "إرسال رابط الدخول"} <ArrowLeft/></Button>
      </form> : <>
        <div className="success-banner">الرابط صالح لفترة محدودة. لو ما لقيتش الرسالة، راجع مجلد الرسائل غير المرغوب فيها.</div>
        <button className="text-action" onClick={()=>{setSent(false);setError("");}}>استخدام بريد مختلف</button>
      </>}
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="privacy-note"><ShieldCheck/><span>بريدك لا يظهر للماسح ولا يُعرض في المسارات العامة.</span></div>
    </section>
  </main>;
}
