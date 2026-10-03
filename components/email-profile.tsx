"use client";
import {useEffect,useState} from 'react';
import {useLocale} from './locale-provider';
import {requestJson} from '@/lib/client-api';
export function EmailProfile(){
 const {t}=useLocale();
 const [state,setState]=useState<{email:string|null;verified:boolean}|null>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{let active=true;void requestJson<{email:string|null;verified:boolean}>('/api/profile/email').then(r=>{if(active)setState(r);}).catch(()=>{if(active)setError(true);});return ()=>{active=false;};},[]);
 return <section><h3>{t('البريد الإلكتروني')}</h3>{state?<><p><b dir="ltr">{state.email}</b> · {t(state.verified?'موثّق ✓':'غير موثّق')}</p>{!state.verified&&<p>{t('يلزم توثيق بريدك لاحقًا. خدمة التوثيق غير متاحة حاليًا؛ تفعيل البطاقة لا يوثّق البريد.')}</p>}</>:<p role="status">{t(error?'تعذر تحميل حالة البريد':'جاري التحميل…')}</p>}<p>{t('استرجاع الحساب متاح حاليًا عبر الدعم بعد التحقق من الملكية.')}</p></section>;
}
