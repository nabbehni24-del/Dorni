"use client";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";
import {KeyRound,ShieldCheck} from "lucide-react";
import {DorniBrand} from "@/components/dorni-brand";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

export default function AdminSetupPage(){
  const router=useRouter();
  const [token,setToken]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError("");try{const response=await fetch("/api/admin/bootstrap",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})});const result=await response.json();if(!response.ok)throw new Error(response.status===401?"سجّل دخولك أولًا بالحساب الذي سيكون مدير دورني.":result.error==="FORBIDDEN"?"رمز التفعيل غير صحيح.":result.error);router.replace("/admin");router.refresh();}catch(value){setError(value instanceof Error?value.message:"تعذر تفعيل الإدارة");}finally{setBusy(false);}}
  return <main className="auth-shell admin-setup" dir="rtl"><header><DorniBrand/><span className="secure-chip"><ShieldCheck/> إعداد لمرة واحدة</span></header><section className="auth-card"><span className="auth-icon"><ShieldCheck/></span><p className="eyebrow">حساب الإدارة الرئيسي</p><h1>تفعيل مدير دورني</h1><p>سجّل دخولك أولًا بحساب الإدارة، ثم أدخل رمز التهيئة المحفوظ في Render. بعد نجاح العملية يُقفل التفعيل ولا يمكن إنشاء مدير ثانٍ بهذه الطريقة.</p><form onSubmit={submit}><label className="auth-field"><span>رمز تهيئة الإدارة</span><div><KeyRound/><Input dir="ltr" type="password" autoComplete="off" value={token} onChange={event=>setToken(event.target.value)} required/></div></label><Button className="primary-action" type="submit" disabled={busy||token.length<16}>{busy?"جاري التفعيل...":"تفعيل هذا الحساب كمدير"}</Button></form>{error&&<p className="form-error" role="alert">{error}</p>}<div className="privacy-note"><ShieldCheck/><span>رمز التهيئة لا يُحفظ في المتصفح ولا يظهر داخل لوحة الإدارة.</span></div></section></main>;
}

