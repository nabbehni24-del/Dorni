"use client";
import { useEffect, useState } from "react";
import { requestJson, errorMessage } from "@/lib/client-api";
import { supportCenterSchema, type SupportCenterSettings } from "@/lib/support-center";
export function SupportCenterSettingsPanel() {
  const [data,setData]=useState<SupportCenterSettings|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  async function load() { try { setData(await requestJson<SupportCenterSettings>("/api/admin/support-center")); setError(""); } catch(e) { setError(errorMessage(e)); } }
  // Fetch persisted configuration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load();},[]);
  function patch(value: Partial<SupportCenterSettings>) { setData(d=>d?{...d,...value}:d); setNotice(""); }
  return <section className="ws-panel"><h2>مركز الدعم وتجربة المبلّغ</h2><p>تُطبّق الإعدادات على البلاغات الحالية والجديدة. المدد بالدقائق؛ صفر يعني إتاحة فورية. الأرقام التي تضيفها ستظهر للمبلّغ عند إتاحة الاتصال.</p>
    {error&&<p role="alert" className="form-error">{error} <button type="button" onClick={()=>void load()}>إعادة التحميل</button></p>}
    {!data?<p>جاري تحميل الإعدادات…</p>:<form onSubmit={async e=>{e.preventDefault();setNotice("");const parsed=supportCenterSchema.safeParse(data);if(!parsed.success){setError("راجع الأرقام والمدد: الرقم من 5 إلى 15 رقماً، ويمكن أن يبدأ بـ +، بدون مسافات.");return;}setBusy(true);setError("");try{setData(await requestJson<SupportCenterSettings>("/api/admin/support-center",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(parsed.data)}));setNotice("تم حفظ إعدادات مركز الدعم وتطبيقها.");}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}}>
      <fieldset disabled={busy} style={{border:0,padding:0,display:"grid",gap:16}}>
        <label>تصعيد البلاغات<select value={String(data.enabled)} onChange={e=>patch({enabled:e.target.value==="true"})}><option value="true">مفعّل</option><option value="false">متوقف مؤقتاً</option></select></label>
        <label>الانتظار قبل طلب الدعم من وقت البلاغ<input type="number" min={0} max={1440} required value={data.escalationMinutes} onChange={e=>patch({escalationMinutes:e.target.valueAsNumber})}/></label>
        <label>الانتظار قبل الاتصال من وقت التصعيد، إذا لم يرد الدعم<input type="number" min={0} max={1440} required value={data.callMinutes} onChange={e=>patch({callMinutes:e.target.valueAsNumber})}/></label>
        <label>ساعات العمل والمنطقة الزمنية<input maxLength={200} value={data.hours} placeholder="اكتب أيام وساعات العمل بتوقيت ليبيا" onChange={e=>patch({hours:e.target.value})}/></label>
        <label>تعليمات الاتصال<textarea maxLength={600} value={data.instructions} onChange={e=>patch({instructions:e.target.value})}/></label>
        <h3>أرقام المركز</h3><p>بدون أرقام لن يظهر زر الاتصال. ترتيب الأرقام هنا هو ترتيب عرضها للمبلّغ.</p>
        {data.phones.map((phone,i)=><fieldset key={i} style={{padding:16,border:"1px solid var(--border)",borderRadius:16}}><legend>رقم {i+1}</legend>
          <label>اسم القسم<input required maxLength={60} value={phone.label} onChange={e=>patch({phones:data.phones.map((p,n)=>n===i?{...p,label:e.target.value}:p)})}/></label>
          <label>رقم الهاتف<input required type="tel" dir="ltr" maxLength={16} pattern="\+?[0-9]{5,15}" value={phone.number} onChange={e=>patch({phones:data.phones.map((p,n)=>n===i?{...p,number:e.target.value}:p)})}/></label>
          <button type="button" onClick={()=>patch({phones:data.phones.filter((_,n)=>n!==i)})}>إزالة الرقم من القائمة</button>
        </fieldset>)}
        <button type="button" disabled={data.phones.length>=8} onClick={()=>patch({phones:[...data.phones,{label:"",number:""}]})}>إضافة رقم دعم</button>
        <button type="submit">{busy?"جاري الحفظ…":"حفظ إعدادات المركز"}</button>
      </fieldset>
    </form>}{notice&&<p role="status" className="success-banner">{notice}</p>}
  </section>;
}
