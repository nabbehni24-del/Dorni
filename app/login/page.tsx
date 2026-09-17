"use client";
import { useState } from "react";
import { ArrowLeft, LockKeyhole, Phone, ShieldCheck } from "lucide-react";
import { DorniBrand } from "@/components/dorni-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router=useRouter();
  const [phone,setPhone]=useState(""),[normalizedPhone,setNormalizedPhone]=useState(""),[code,setCode]=useState(""),[sent,setSent]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function requestOtp(){setBusy(true);setError("");const r=await fetch("/api/auth/request-otp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone})});const d=await r.json();setBusy(false);if(!r.ok)return setError(d.error);setNormalizedPhone(d.phone);setSent(true);}
  async function verify(){setBusy(true);setError("");const r=await fetch("/api/auth/verify-otp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone:normalizedPhone,code})});const d=await r.json();setBusy(false);if(!r.ok)return setError(d.error);router.push("/app");router.refresh();}
  return <main className="auth-shell" dir="rtl"><header><DorniBrand/><span className="secure-chip"><ShieldCheck/> خصوصيتك محفوظة</span></header><section className="auth-card"><span className="auth-icon">{sent?<LockKeyhole/>:<Phone/>}</span><p className="eyebrow">حساب صاحب السيارة</p><h1>{sent?"أدخل رمز التحقق":"سجّل برقم هاتفك"}</h1><p>{sent?`بعثنا رمزاً من 6 أرقام إلى ${normalizedPhone}`:"رقمك لتسجيل الدخول واستقبال تنبيهات سيارتك، ولن يظهر للماسح."}</p>{!sent?<><label className="auth-field"><span>رقم الهاتف الليبي</span><div><b dir="ltr">+218</b><Input dir="ltr" placeholder="0912345678" value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="tel"/></div></label><Button className="primary-action" onClick={requestOtp} disabled={busy||phone.length<9}>إرسال رمز التحقق <ArrowLeft/></Button></>:<><div className="otp-wrap" dir="ltr"><InputOTP maxLength={6} value={code} onChange={setCode}><InputOTPGroup>{[0,1,2,3,4,5].map(i=><InputOTPSlot index={i} key={i}/>)}</InputOTPGroup></InputOTP></div><Button className="primary-action" onClick={verify} disabled={busy||code.length!==6}>دخول إلى حسابي</Button><button className="text-action" onClick={()=>{setSent(false);setCode("");}}>تغيير رقم الهاتف</button></>}{error&&<p className="form-error" role="alert">{error}</p>}<div className="privacy-note"><ShieldCheck/><span>جلسة آمنة ورقمك لا يُعرض في المسارات العامة.</span></div></section></main>;
}
