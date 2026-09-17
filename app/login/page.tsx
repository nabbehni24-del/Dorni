"use client";
/* eslint-disable @next/next/no-location-assign-relative-destination */
import { useState } from "react";
import { ArrowLeft, CheckCircle2, LockKeyhole, Phone, ShieldCheck } from "lucide-react";
import { DorniBrand } from "@/components/dorni-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function LoginPage() {
  const [phone,setPhone]=useState("0912345678"),[challengeId,setChallengeId]=useState(""),[code,setCode]=useState(""),[devCode,setDevCode]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function requestOtp(){setBusy(true);setError("");const r=await fetch("/api/auth/request-otp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone})});const d=await r.json();setBusy(false);if(!r.ok)return setError(d.error);setChallengeId(d.challengeId);setDevCode(d.developmentCode??"");}
  async function verify(){setBusy(true);setError("");const r=await fetch("/api/auth/verify-otp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({challengeId,code})});const d=await r.json();setBusy(false);if(!r.ok)return setError(d.error);window.location.assign("/app");}
  return <main className="auth-shell" dir="rtl"><header><DorniBrand/><span className="secure-chip"><ShieldCheck/> جلسة مشفّرة</span></header><section className="auth-card"><span className="auth-icon">{challengeId?<LockKeyhole/>:<Phone/>}</span><p className="eyebrow">حساب صاحب السيارة</p><h1>{challengeId?"أدخل رمز التحقق":"سجّل برقم هاتفك"}</h1><p>{challengeId?`بعثنا رمز مكوّن من 6 أرقام إلى ${phone}`:"بنستخدم الرقم فقط لتسجيل الدخول واستقبال تنبيهات سيارتك."}</p>{!challengeId?<><label className="auth-field"><span>رقم الهاتف</span><div><b dir="ltr">+218</b><Input dir="ltr" value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel"/></div></label><Button className="primary-action" onClick={requestOtp} disabled={busy}>إرسال رمز التحقق <ArrowLeft/></Button></>:<><div className="otp-wrap" dir="ltr"><InputOTP maxLength={6} value={code} onChange={setCode}><InputOTPGroup>{[0,1,2,3,4,5].map(i=><InputOTPSlot index={i} key={i}/>)}</InputOTPGroup></InputOTP></div>{devCode&&<div className="dev-otp"><CheckCircle2/><span>وضع الاختبار الخاص: رمزك <b dir="ltr">{devCode}</b></span></div>}<Button className="primary-action" onClick={verify} disabled={busy||code.length!==6}>دخول إلى حسابي</Button><button className="text-action" onClick={()=>{setChallengeId("");setCode("");}}>تغيير رقم الهاتف</button></>}{error&&<p className="form-error">{error}</p>}<div className="privacy-note"><ShieldCheck/><span>رقمك لا يظهر لأي شخص يمسح كود السيارة.</span></div></section></main>;
}
