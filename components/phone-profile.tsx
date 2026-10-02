"use client";
import {useEffect,useState} from 'react';
import {useLocale} from './locale-provider';
import {requestJson,errorMessage} from '@/lib/client-api';
type Phone={phone:string|null;verified:boolean};
export function PhoneProfile(){
 const {t}=useLocale();const [saved,setSaved]=useState<Phone|null>(null),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(){try{const r=await requestJson<{data:Phone}>('/api/profile/phone');setSaved(r.data);setDraft(r.data.phone??'');setError('');}catch(e){setError(errorMessage(e));}}
 // Fetch the server's authoritative verification state, never a local flag.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{void load();},[]);
 async function save(value:string|null){if(!saved||busy)return;setBusy(true);setError('');setNotice('');try{const r=await requestJson<{data:Phone}>('/api/profile/phone',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:value,expectedPhone:saved.phone})});setSaved(r.data);setDraft(r.data.phone??'');setNotice(r.data.phone?'تم حفظ رقم الهاتف.':'تمت إزالة رقم الهاتف.');}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <section aria-label={t('رقم الهاتف')}><h3>{t('رقم الهاتف')}</h3>{saved?<><p>{saved.phone?<><b dir="ltr">{saved.phone}</b> · {t(saved.verified?'موثّق ✓':'غير موثّق')}</>:t('لم تضف رقم هاتف بعد.')}</p><form onSubmit={e=>{e.preventDefault();void save(draft);}}><label htmlFor="profile-phone">{t('رقم الهاتف')} <small>{t('اختياري')}</small></label><input id="profile-phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={64} placeholder="091 234 5678" value={draft} disabled={busy} onChange={e=>{setDraft(e.target.value);setNotice('');}} aria-describedby="profile-phone-help"/><p id="profile-phone-help">{t('نحفظ الرقم بصيغة +218. حفظ الرقم لا يعني توثيقه، ولا يغيّر طريقة تسجيل دخولك.')}</p><button disabled={busy||draft===(saved.phone??'')}>{t(busy?'جاري الحفظ…':'حفظ رقم الهاتف')}</button>{saved.phone&&<button type="button" disabled={busy} onClick={()=>void save(null)}>{t('إزالة رقم الهاتف')}</button>}</form><p>{t('رقمك لا يظهر لمُرسل التنبيه أو للشركة التي أصدرت بطاقتك.')}</p></>:<p role="status">{t('جاري تحميل رقم الهاتف…')}</p>}{error&&<><p role="alert" className="form-error">{t(error)}</p><button disabled={busy} onClick={()=>void load()}>{t('تحديث البيانات')}</button></>}{notice&&<p role="status" className="success-banner">{t(notice)}</p>}</section>;
}
