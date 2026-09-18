"use client";
import { FormEvent,useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound,ShieldCheck } from "lucide-react";
import { DorniBrand } from "@/components/dorni-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function ResetPasswordPage(){const router=useRouter();const [password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError("");const r=await fetch("/api/auth/update-password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password})});const j=await r.json();setBusy(false);if(!r.ok)return setError(j.error);router.replace("/app");router.refresh();}return <main className="auth-shell" dir="rtl"><header><DorniBrand/><span className="secure-chip"><ShieldCheck/> اتصال آمن</span></header><section className="auth-card"><span className="auth-icon"><KeyRound/></span><p className="eyebrow">استرجاع الحساب</p><h1>اختر كلمة مرور جديدة</h1><p>لازم تكون 8 أحرف على الأقل وتحتوي على رقم.</p><form onSubmit={submit}><label className="auth-field"><span>كلمة المرور الجديدة</span><div><Input dir="ltr" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required/></div></label><Button className="primary-action" disabled={busy}>{busy?"جاري الحفظ...":"حفظ ودخول"}</Button></form>{error&&<p className="form-error">{error}</p>}</section></main>}
