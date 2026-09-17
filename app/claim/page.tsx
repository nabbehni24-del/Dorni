"use client";
import { useState } from "react";
import { Check, KeyRound, ScanLine, ShieldCheck } from "lucide-react";
import { DorniBrand } from "@/components/dorni-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ClaimPage() {
  const [claimed, setClaimed] = useState(false);
  return <main className="claim-shell" dir="rtl"><header><DorniBrand /><BadgeLike /></header><section className="claim-card">{claimed ? <><div className="success-mark"><Check /></div><p className="eyebrow">اكتملت المطالبة</p><h1>بطاقتك جاهزة</h1><p>تم ربط بطاقة دورني بسيارة تويوتا كامري وتفعيل رمز المسح العام.</p><div className="claim-success-row"><ShieldCheck /><span>تم استهلاك رمز المطالبة نهائياً ولن يعمل مرة ثانية.</span></div><Button asChild className="primary-action"><a href="/app">الذهاب إلى سياراتي</a></Button></> : <><span className="claim-icon"><ScanLine /></span><p className="eyebrow">تفعيل بطاقة دورني</p><h1>أدخل الرمز تحت طبقة الحماية</h1><p>رمز المطالبة منفصل تماماً عن رمز QR الظاهر للناس.</p><label><span>رمز المطالبة</span><div className="claim-input"><KeyRound /><Input dir="ltr" placeholder="DORNI-••••-••••" /></div></label><label><span>اختر السيارة</span><button className="vehicle-choice"><span><b>تويوتا كامري</b><small>أبيض • 2021</small></span><Check /></button></label><Button className="primary-action" onClick={() => setClaimed(true)}>تأكيد وتفعيل البطاقة</Button><p className="privacy-footer"><ShieldCheck /> تتم المطالبة مرة واحدة وبشكل آمن</p></>}</section></main>;
}

function BadgeLike() { return <span className="secure-chip"><ShieldCheck /> مطالبة آمنة</span>; }
