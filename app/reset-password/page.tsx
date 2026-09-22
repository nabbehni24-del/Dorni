"use client";
import { FormEvent,useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound,ShieldCheck } from "lucide-react";
import { DorniBrand } from "@/components/dorni-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestJson,errorMessage } from "@/lib/client-api";
export default function ResetPasswordPage(){const router=useRouter();const [password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError("");try{await requestJson("/api/auth/update-password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password})});const context=await requestJson<{destination:string}>("/api/auth/context");router.replace(context.destination);router.refresh();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}return <main className="auth-shell" dir="rtl"><header><DorniBrand/><span className="secure-chip"><ShieldCheck/> اتصال آمن</span></header><section className="auth-card"><span className="auth-icon"><KeyRound/></span><p className="eyebrow">استرجاع الحساب</p><h1>اختر كلمة مرور جديدة</h1><p>لازم تكون 8 أحرف على الأقل، فيها حرف إنجليزي ورقم.</p><form onSubmit={submit}><label className="auth-field"><span>كلمة المرور الجديدة</span><div><Input dir="ltr" type="password" autoComplete="new-password" minLength={8} maxLength={128} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,128}" value={password} onChange={e=>setPassword(e.target.value)} required/></div></label><Button className="primary-action" disabled={busy}>{busy?"جاري الحفظ...":"حفظ ودخول"}</Button></form>{error&&<p className="form-error">{error}</p>}</section></main>}
