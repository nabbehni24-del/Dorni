"use client";
import {useLocale} from "@/components/locale-provider";

import { useEffect, useState } from "react";
import { Check, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { type ReportSupport } from "@/lib/support-center";
import { statusLabels } from "@/lib/support";
import s from "./report-support.module.css";

const responseLabel: Record<string, string> = {
  ON_MY_WAY: "صاحب السيارة جاي",
  RESOLVED: "تم حل الموضوع",
  CANNOT_REACH_NOW: "صاحب السيارة مش قادر يوصل توا",
};

type ReportStatus = {
  status: string;
  ownerResponse: string | null;
  updatedAt: string;
  support: ReportSupport;
};

export function StatusClient({ token, contactMode = false }: { token: string; contactMode?: boolean }) {
 const {t,dir}=useLocale();
  const [data, setData] = useState<ReportStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function escalate() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/public/status/${token}`, {method:"POST"});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر طلب الدعم");
      setData(result);
    } catch(e) { setError(e instanceof Error?e.message:"تعذر الاتصال"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    async function load() {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/public/status/${token}`, { cache: "no-store" });
        const result = await response.json();
        if (!alive) return;
        if (!response.ok) {
          setError(result.error ?? "تعذر تحميل حالة البلاغ");
          if (response.status === 404) setData(null);
        } else {
          setError("");
          setData(result);
        }
      } catch {
        if (alive) setError("تعذر تحديث حالة البلاغ؛ سنعيد المحاولة.");
      } finally {
        inFlight = false;
      }
    }
    void load();
    const timer = window.setInterval(() => { void load(); }, 5000);
    const resume = () => { void load(); };
    document.addEventListener("visibilitychange",resume);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange",resume); };
  }, [token]);

  const answered = Boolean(data?.ownerResponse);
  const support = data?.support;
  if(contactMode) return <main className="public-shell" dir={dir}><section className={`status-card ${s.panel}`}>
    <Link href={`/status/${token}`} className={s.back}>← {t("رجوع لمتابعة البلاغ")}</Link><h1>{t("اتصل بمركز الدعم")}</h1>
    {error&&<p role="alert">{t(error)}</p>}
    {!data&&!error?<p>{t("جاري التحميل…")}</p>:support?.canCall&&support.contact?<>
      <p>{t("أعطِ الموظف رقم التذكرة للوصول إلى تفاصيل البلاغ.")}</p><code className={s.reference} dir="ltr">{support.ticket?.id}</code>
      {support.contact.hours&&<p>{support.contact.hours}</p>}{support.contact.instructions&&<p>{support.contact.instructions}</p>}
      <div className={s.contacts}>{support.contact.phones.map((phone,i)=><a key={i} href={`tel:${phone.number}`}><strong>{phone.label}</strong><span dir="ltr">{phone.number}</span><small>{t("اضغط للاتصال")}</small></a>)}</div>
    </>:<p>{t("الاتصال بالمركز غير متاح لهذه الحالة الآن. تابع ردود الدعم من صفحة البلاغ.")}</p>}
    <p className={s.muted}>{t("دورني ليس بديلاً عن خدمات الطوارئ عند وجود خطر مباشر.")}</p>
  </section></main>;
  return <main className="public-shell" dir={dir}>
    <section className="status-card">
      {error && !data ? <>
        <div className="success-mark"><Clock3/></div>
        <h1>{t("رابط الحالة غير متاح")}</h1>
        <p className="support-copy">{t(error)}</p>
      </> : !data ? <>
        <RefreshCw className="spin status-spinner"/>
        <h1>{t("جاري تحميل حالة البلاغ")}</h1>
      </> : <>
        <div className={`success-mark status-mark ${answered ? "status-mark--responded" : "status-mark--waiting"}`}>
          <Check/>
        </div>
        <p className="eyebrow">{t("بلاغ محفوظ")}</p>
        <h1>{answered ? t(responseLabel[data.ownerResponse!] ?? "رد صاحب السيارة") : t("في انتظار رد صاحب السيارة")}</h1>
        <p className="support-copy">{t("هذه الحالة تُحدّث تلقائياً من رد صاحب السيارة المحفوظ في دورني.")}</p>
        {error && <p className="refresh-error" role="status">{t(error)}</p>}
        <div className="status-steps">
          <div className="status-step is-done"><span>1</span><div><strong>{t("تم استلام البلاغ")}</strong><small>{t("مسجّل في النظام")}</small></div></div>
          <div className={`status-step ${answered ? "is-done" : "is-waiting"}`}><span>2</span><div><strong>{t("رد صاحب السيارة")}</strong><small>{answered ? t(responseLabel[data.ownerResponse!] ?? "تم الرد") : t("في انتظار الرد")}</small></div></div>
        </div>
        {support && <section className={s.panel} aria-label={t("متابعة الدعم الفني")}>
          <h2>{t("الدعم الفني")}</h2>
          {support.ticket?<>
            <p role="status">{t(statusLabels[support.ticket.status] || "قيد المتابعة")}</p>
            <small>{t("رقم التذكرة")}</small><code className={s.reference} dir="ltr">{support.ticket.id}</code>
            <p>{t("وصلت الحالة للدعم مع بيانات الكود والسيارة. تظهر ردود الفريق هنا تلقائياً.")}</p>
            <div className={s.messages} aria-live="polite">{support.messages.map(message=><article key={message.id}><strong>{t("فريق دورني")}</strong><p>{message.body}</p><time>{new Date(message.createdAt).toLocaleString("ar-LY")}</time></article>)}</div>
            {support.canCall?<Link className={s.action} href={`/status/${token}/contact`}>{t("اتصل بمركز الدعم")}</Link>:support.messages.length===0&&!['RESOLVED','CLOSED'].includes(support.ticket.status)&&<p className={s.muted}>{t("بانتظار رد الدعم. خيار الاتصال يظهر عند إتاحته حسب إعدادات المركز.")}</p>}
          </>:support.canEscalate?<><p>{t("ما زالت المشكلة قائمة؟ أرسل الحالة لفريق الدعم لمتابعتها.")}</p><button className={s.action} disabled={busy} onClick={()=>void escalate()}>{busy?t("جاري إرسال الحالة…"):t("طلب مساعدة من الدعم")}</button></>:<p className={s.muted}>{t(!support.enabled?"استقبال التصعيد متوقف مؤقتاً.":answered&&data.ownerResponse!=="CANNOT_REACH_NOW"?"تم استلام رد صاحب السيارة.":["RESOLVED","BLOCKED","EXPIRED"].includes(data.status)?"البلاغ لم يعد مفتوحاً للتصعيد.":"إذا لم يرد صاحب السيارة، سيظهر خيار طلب الدعم بعد مدة الانتظار.")}</p>}
        </section>}
        <div className="privacy-note"><ShieldCheck/><span>{t("الرابط خاص بهذا البلاغ وينتهي تلقائياً.")}</span></div>
      </>}
    </section>
  </main>;
}
