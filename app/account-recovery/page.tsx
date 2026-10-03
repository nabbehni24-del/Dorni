"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {DorniBrand} from '@/components/dorni-brand';
import {useLocale} from '@/components/locale-provider';
import {requestJson} from '@/lib/client-api';
type Contacts={phones?:{label:string;number:string}[];hours?:string};
export default function AccountRecovery(){
 const {t,dir}=useLocale();const [contacts,setContacts]=useState<Contacts|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let active=true;void requestJson<Contacts>('/api/account-recovery').then(r=>{if(active)setContacts(r);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[]);
 const phones=contacts?.phones?.filter(p=>/^\+?[0-9]{5,15}$/.test(p.number))??[];
 return <main className="auth-shell" dir={dir}><header><DorniBrand/><Link href="/login">{t('رجوع لتسجيل الدخول')}</Link></header><section className="auth-card"><h1>{t('استرجاع الحساب عبر الدعم')}</h1><p>{t('يساعدك الدعم على استرجاع الحساب بعد التحقق من الملكية. لا يُغيّر الحساب تلقائيًا عند إرسال الطلب.')}</p><p>{t('لا ترسل كلمة مرورك أو رمز بطاقتك. البريد أو الرقم غير الموثّق وحده لا يكفي لاسترجاع الحساب.')}</p>{!contacts&&!error?<p role="status">{t('جاري التحميل…')}</p>:error?<p role="alert">{t('تعذر تحميل وسائل الدعم. حاول لاحقًا.')}</p>:phones.length?<>{phones.map(p=><p key={p.number}><a href={'tel:'+p.number}>{p.label} — <b dir="ltr">{p.number}</b></a></p>)}{contacts?.hours&&<p>{contacts.hours}</p>}</>:<p role="status">{t('أرقام مركز الدعم غير منشورة حاليًا. تواصل مع الجهة التي سلّمتك البطاقة للوصول إلى دعم Dorni.')}</p>}</section></main>;
}
