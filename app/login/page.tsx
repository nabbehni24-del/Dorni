"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Phone, RotateCcw, ShieldCheck } from "lucide-react";
import { DorniBrand } from "@/components/dorni-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type Step = "phone" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("0911111111");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر إرسال رمز الدخول");
      setNormalizedPhone(data.phone);
      setCode("");
      setStep("code");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "تعذر إرسال رمز الدخول");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone || phone, code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "الرمز غير صحيح أو منتهي");
      router.replace("/app");
      router.refresh();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "تعذر تسجيل الدخول");
    } finally {
      setBusy(false);
    }
  }

  function changePhone() {
    setStep("phone");
    setCode("");
    setError("");
  }

  return <main className="auth-shell" dir="rtl">
    <header><DorniBrand/><span className="secure-chip"><ShieldCheck/> خصوصيتك محفوظة</span></header>
    <section className="auth-card">
      <span className="auth-icon">{step === "phone" ? <Phone/> : <KeyRound/>}</span>
      <p className="eyebrow">حساب صاحب السيارة</p>
      <h1>{step === "phone" ? "ادخل برقم هاتفك" : "اكتب رمز التحقق"}</h1>
      <p>{step === "phone"
        ? "اكتب رقم هاتفك الليبي ونبعث لك رمز دخول من 6 أرقام."
        : `بعثنا الرمز إلى ${normalizedPhone}. اكتبه لإكمال الدخول.`}</p>

      <div className="dev-otp">
        <span>تجربة مؤقتة:</span><b dir="ltr">0911111111</b><span>الرمز:</span><b dir="ltr">246810</b>
      </div>

      {step === "phone" ? <form onSubmit={requestCode}>
        <label className="auth-field">
          <span>رقم الهاتف</span>
          <div><Input dir="ltr" type="tel" inputMode="tel" placeholder="0912345678" value={phone} onChange={event=>setPhone(event.target.value)} autoComplete="tel" required/></div>
        </label>
        <Button className="primary-action" type="submit" disabled={busy||phone.replace(/\D/g, "").length < 9}>{busy ? "جاري إرسال الرمز..." : "إرسال رمز الدخول"} <ArrowLeft/></Button>
      </form> : <form onSubmit={verifyCode}>
        <div className="otp-wrap" dir="ltr">
          <InputOTP maxLength={6} value={code} onChange={setCode} inputMode="numeric" autoFocus>
            <InputOTPGroup>
              {[0,1,2,3,4,5].map(index=><InputOTPSlot key={index} index={index}/>) }
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button className="primary-action" type="submit" disabled={busy||code.length!==6}>{busy ? "جاري التحقق..." : "تحقق وادخل"} <ArrowLeft/></Button>
        <button className="text-action" type="button" disabled={busy} onClick={()=>requestCode()}><RotateCcw/> إعادة إرسال الرمز</button>
        <button className="text-action" type="button" disabled={busy} onClick={changePhone}>تغيير رقم الهاتف</button>
      </form>}

      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="privacy-note"><ShieldCheck/><span>رقمك لا يظهر للماسح ولا يُعرض في المسارات العامة.</span></div>
    </section>
  </main>;
}
