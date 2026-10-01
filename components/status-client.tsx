"use client";
import {useLocale} from "@/components/locale-provider";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowRight,Check,CheckCircle2,Clock3,Copy,Headphones,Phone,RefreshCw,ShieldCheck,WifiOff,CarFront} from "lucide-react";
import {DorniBrand} from "./dorni-brand";
import {useReportStatus} from "./use-report-status";
import {statusLabels} from "@/lib/support";
import {copyText} from "@/lib/client-api";
import s from "./report-support.module.css";

const responses:Record<string,string>={ON_MY_WAY:"صاحب السيارة في الطريق",RESOLVED:"تم حل الموضوع",CANNOT_REACH_NOW:"صاحب السيارة لا يستطيع الوصول حالياً"};
const reasons:Record<string,string>={BLOCKING_EXIT:"السيارة تعيق الخروج",PLEASE_MOVE:"طلب تحريك السيارة",LIGHTS_ON:"الأنوار مضاءة",DOOR_OR_WINDOW_OPEN:"باب أو نافذة مفتوحة",VEHICLE_DAMAGE:"مشكلة بالسيارة",URGENT_ATTENTION:"تنبيه عاجل"};
function Countdown({at,offset}:{at:string;offset:number}) {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)setNow(Date.now());},1000);return()=>clearInterval(timer);},[]);
  const seconds=Math.max(0,Math.ceil((Date.parse(at)-now-offset)/1000));
  return <span dir="ltr" className={s.countdown}>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,"0")}</span>;
}
export function StatusClient({token,contactMode=false}:{token:string;contactMode?:boolean}) {
  const {t,dir}=useLocale();
  const state=useReportStatus(token);
  const {data,error,unavailable,offline,live,refreshing,busy,checkedAt,clockOffset,refresh,escalate}=state;
  const [notice,setNotice]=useState("");
  const support=data?.support;
  const resolved=data?.status==="RESOLVED"||data?.ownerResponse==="RESOLVED";
  const closed=Boolean(data&&["RESOLVED","EXPIRED","BLOCKED"].includes(data.status));
  const answered=Boolean(data?.ownerResponse);
  const supportAnswered=Boolean(support?.messages.length);
  const supportClosed=Boolean(support?.ticket&&["RESOLVED","CLOSED"].includes(support.ticket.status));
  const title=resolved?"تم حل البلاغ":data?.status==="BLOCKED"?"هذا البلاغ غير متاح للمتابعة":data?.status==="EXPIRED"?"انتهت مدة البلاغ":answered?(responses[data!.ownerResponse!]||"وصل رد صاحب السيارة"):"بلاغك وصل للنظام";
  async function copy(value:string,label:string){try{await copyText(value);setNotice(label);}catch(e){setNotice(e instanceof Error?e.message:"تعذر النسخ");}}
  return <main className={s.page} dir={dir}>
    <header className={s.header}><DorniBrand/><span><ShieldCheck size={16}/>{t("متابعة آمنة")}</span></header>
    <div className={s.topline}>
      {contactMode?<Link className={s.back} href={"/status/"+token}><ArrowRight size={18}/>{t("متابعة البلاغ")}</Link>:<span>{t("متابعة البلاغ")}</span>}
      <span className={s.connection} data-live={live&&!error}>{offline?<WifiOff size={14}/>:<i/>}{t(offline?"غير متصل":error?"نعيد الاتصال":live?"تحديث مباشر":"تحديث تلقائي")}</span>
    </div>
    {error&&<div className={s.error} role="alert"><p>{t(error)}</p><button disabled={refreshing||offline} onClick={()=>void refresh(true)}><RefreshCw size={16}/>{t("إعادة المحاولة")}</button></div>}
    {offline&&<p className={s.warning} role="status">{t("انقطع الإنترنت. آخر حالة محفوظة ظاهرة أمامك، ونحدّثها عند رجوع الاتصال.")}</p>}
    {!data?<section className={s.hero}>
      <div className={s.symbol}>{unavailable?<Clock3/>:<RefreshCw className={refreshing?"spin":""}/>}</div>
      <h1>{t(unavailable?"رابط المتابعة غير متاح":error?"تعذر الاتصال مؤقتاً":"جاري فتح بلاغك…")}</h1>
      <p>{t(unavailable?"قد يكون الرابط منتهياً أو ناتجاً عن محاولة قديمة. امسح بطاقة السيارة مجدداً لإرسال بلاغ والحصول على رابط جديد.":"لا تحتاج لإرسال بلاغ آخر. سنحاول تحميل الحالة مجدداً.")}</p>
    </section>:contactMode?<section className={s.hero}>
      <div className={s.symbol}><Phone/></div><h1>{t("اتصل بمركز الدعم")}</h1>
      {support?.canCall&&support.contact?<>
        <p>{t("أعطِ الموظف رقم التذكرة للوصول إلى ملف الحالة.")}</p>
        <button className={s.referenceButton} onClick={()=>void copy(support.ticket!.id,"تم نسخ رقم التذكرة")}><code dir="ltr">{support.ticket!.id}</code><Copy size={16}/></button>
        {support.contact.hours&&<p>{support.contact.hours}</p>}{support.contact.instructions&&<p>{support.contact.instructions}</p>}
        <div className={s.contacts}>{support.contact.phones.map((phone,i)=><a key={i} href={"tel:"+phone.number}><Phone/><div><strong>{phone.label}</strong><span dir="ltr">{phone.number}</span><small>{t("اضغط للاتصال")}</small></div></a>)}</div>
      </>:<><p>{t(supportAnswered?"وصل رد من الدعم. ارجع للمتابعة لقراءته.":"الاتصال بالمركز غير متاح لهذه الحالة الآن.")}</p><Link className={s.action} href={"/status/"+token}>{t("العودة للمتابعة")}</Link></>}
    </section>:<>
      <section className={s.hero} data-resolved={resolved}>
        <div className={s.symbol}>{resolved?<CheckCircle2/>:answered?<CarFront/>:<Check/>}</div>
        <p className={s.eyebrow}>{t(resolved?"اكتملت المتابعة":answered?"رد صاحب السيارة":"تم تسجيل البلاغ")}</p>
        <h1 aria-live="polite">{t(title)}</h1>
        <p>{t(resolved?"شكراً لتنبيهك واهتمامك.":answered?"هذا هو آخر رد محفوظ من صاحب السيارة.":"في انتظار رد صاحب السيارة. خليك في الصفحة؛ الرد يظهر تلقائياً.")}</p>
        <div className={s.vehicle}><CarFront size={22}/><div><strong>{data.vehicle?.manufacturer} {data.vehicle?.model}</strong><span>{data.vehicle?.color} · {t(reasons[data.reportType]||data.reportType)}</span></div><span className={s.ref} dir="ltr">#{data.reference}</span></div>
      </section>
      <ol className={s.steps} aria-label={t("مراحل البلاغ")}>
        {[["إرسال البلاغ",true],["رد صاحب السيارة",answered],["متابعة الدعم",Boolean(support?.ticket)]].map(([label,done],i)=><li key={String(label)} data-done={Boolean(done)}><span>{done?<Check size={16}/>:i+1}</span><strong>{t(String(label))}</strong></li>)}
      </ol>
      {support&&<section className={s.panel} aria-label={t("متابعة الدعم الفني")}>
        <div className={s.sectionTitle}><Headphones/><div><h2>{t("فريق دورني معاك")}</h2><p>{t(support.ticket?"متابعة الحالة مع الدعم الفني":"إذا لم يصلك رد، نساعدك في متابعة الحالة")}</p></div>{support.ticket&&<span className={s.badge}>{t(statusLabels[support.ticket.status]||"قيد المتابعة")}</span>}</div>
        {support.ticket?<>
          <div className={s.ticketLine}><span>{t("رقم التذكرة")}</span><button onClick={()=>void copy(support.ticket!.id,"تم نسخ رقم التذكرة")} aria-label={t("نسخ رقم التذكرة")}><code dir="ltr">{support.ticket.id.slice(0,8)}</code><Copy size={15}/></button></div>
          <p className={s.muted}>{t("وصلت الحالة للفريق مع بيانات الكود والسيارة. لا تحتاج لإعادة إرسالها.")}</p>
          <div className={s.messages} aria-live="polite">{support.messages.map(message=><article key={message.id}><header><Headphones size={17}/><strong>{t("فريق دورني")}</strong><time>{new Date(message.createdAt).toLocaleTimeString("ar-LY",{hour:"2-digit",minute:"2-digit"})}</time></header><p>{message.body}</p></article>)}</div>
          {!supportAnswered&&!supportClosed&&<div className={s.wait}><Clock3/><span>{t("بانتظار رد الفريق")}</span></div>}
          {support.canCall?<Link className={s.action} href={"/status/"+token+"/contact"}><Phone size={18}/>{t("اتصل بمركز الدعم")}</Link>:!supportAnswered&&!supportClosed&&!closed&&<p className={s.muted}>{t("خيار الاتصال يظهر عند إتاحته حسب إعدادات المركز.")}</p>}
          {supportClosed&&<p className={s.success}><CheckCircle2 size={18}/>{t("تم إنهاء تذكرة الدعم.")}</p>}
        </>:support.canEscalate?<><p>{t("ما زالت المشكلة قائمة؟ ننقل البلاغ للفريق لمتابعته مع صاحب السيارة.")}</p><button className={s.action} disabled={busy||offline} onClick={()=>void escalate()}>{busy?<RefreshCw size={18} className="spin"/>:<Headphones size={18}/>} {t(busy?"جاري تأكيد طلب الدعم…":"طلب مساعدة من الدعم")}</button></>:<div className={s.wait}><Clock3/><div><strong>{t(!support.enabled?"استقبال التصعيد متوقف مؤقتاً":closed?"انتهت متابعة هذا البلاغ":answered&&data.ownerResponse!=="CANNOT_REACH_NOW"?"تم استلام رد صاحب السيارة":"ننتظر رد صاحب السيارة")}</strong>{support.enabled&&!closed&&(!answered||data.ownerResponse==="CANNOT_REACH_NOW")&&<p>{t("إتاحة طلب الدعم خلال")} <Countdown at={support.escalationAt} offset={clockOffset}/></p>}</div></div>}
      </section>}
      <div className={s.tools}><button disabled={refreshing||offline||busy} onClick={()=>void refresh(true)}><RefreshCw size={16} className={refreshing?"spin":""}/>{t("تحديث الحالة")}</button><button onClick={()=>void copy(window.location.href,"تم نسخ رابط المتابعة")}><Copy size={16}/>{t("نسخ رابط المتابعة")}</button></div>
      {checkedAt>0&&<p className={s.checked}>{t("آخر تحقق")} {new Date(checkedAt).toLocaleTimeString("ar-LY",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</p>}
    </>}
    {notice&&<p role="status" className={s.success}>{t(notice)}</p>}
    <footer className={s.footer}><ShieldCheck size={18}/><p>{t("احتفظ بالرابط؛ أي شخص معه الرابط يستطيع متابعة هذا البلاغ حتى انتهاء مدته.")}<br/>{t("دورني ليس بديلاً عن خدمات الطوارئ عند وجود خطر مباشر.")}</p></footer>
  </main>;
}
