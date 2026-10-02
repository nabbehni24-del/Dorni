"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,Check,ShieldCheck} from 'lucide-react';
import {DorniBrand} from './dorni-brand';
import {useLocale} from './locale-provider';
import {ServiceDetail,ServiceFacts,type ServiceView} from './service-detail';
import './activation-journey.css';
import {serviceDuration} from '@/lib/service-view';
import {useRouter} from 'next/navigation';
type Vehicle={id:string;manufacturer:string;model:string;color:string;occupied:boolean};
type Journey={state:string;journeyId:string;serial?:string;plan?:string;unit?:string;duration?:number;versionId?:string|null;vehicles?:Vehicle[];service?:ServiceView};
const messages:Record<string,string>={INVALID:'تعذر التحقق من البطاقة. راجع رمز التفعيل الخاص أو حاول لاحقًا.',USED:'هذه البطاقة مرتبطة بحساب بالفعل. سجّل الدخول بحساب مالكها أو تواصل مع الدعم.',SUSPENDED:'هذه البطاقة معلقة إداريًا. تواصل مع الدعم قبل التفعيل.',MISSING:'افتح رابط التفعيل الخاص ببطاقتك. إذا أكدت بريدك في متصفح آخر، ارجع إلى المتصفح الذي بدأت منه أو امسح رابط التفعيل مجددًا.',ACCOUNT_CHANGED:'بدأت هذه الرحلة بحساب آخر. ادخل بنفس الحساب أو افتح رابط التفعيل الخاص من جديد.',CONTEXT_CHANGED:'تم فتح بطاقة أخرى في هذا المتصفح. حدّث الصفحة وراجع البطاقة قبل التأكيد.',TERMS_CHANGED:'تغيرت الخدمة المرفقة بالبطاقة. حدّث الصفحة لمراجعتها قبل التأكيد.',VEHICLE_OCCUPIED:'المركبة المختارة لديها بطاقة بالفعل. اختر مركبة أخرى؛ لن نستبدل بطاقتها تلقائيًا.',VEHICLE_UNAVAILABLE:'المركبة لم تعد متاحة. حدّث القائمة واختر مركبتك.',RETRY:'تعذر إكمال العملية. أعد المحاولة؛ سنتحقق أولًا إن كان التفعيل قد اكتمل.',UNAVAILABLE:'تعذر عرض خدمة البطاقة. افتح مركباتي أو تواصل مع الدعم.'};
export function ActivationJourney(){
 const {t,dir}=useLocale();const router=useRouter();const started=useRef(false),draftLoaded=useRef(false);
 const [journey,setJourney]=useState<Journey|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[manual,setManual]=useState(false),[serial,setSerial]=useState(''),[credential,setCredential]=useState('');
 const [vehicle,setVehicle]=useState(''),[form,setForm]=useState({manufacturer:'',model:'',color:''});
 async function load(){
  const r=await fetch('/api/activation',{cache:'no-store'});
  if(r.status===401){window.location.replace('/login?next=/claim');return;}
  const j:Journey=await r.json();setJourney(j);
  if(j.state==='READY'&&!draftLoaded.current){draftLoaded.current=true;let draft=null;
   try{draft=JSON.parse(sessionStorage.getItem('activation-draft:'+j.journeyId)??'null');}catch{}
   const available=j.vehicles?.filter(v=>!v.occupied)??[];
   setVehicle(draft?.vehicle??(available.length===1?available[0].id:available.length===0?'new':''));if(draft?.form)setForm(draft.form);
  }
 }
 async function capture(s:string,c:string){
  const r=await fetch('/api/activation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'capture',serial:s,code:c})});
  if(!r.ok)throw Error(t('تعذر حفظ رابط التفعيل. امسحه مجددًا.'));
  draftLoaded.current=false;setManual(false);await load();
 }
 useEffect(()=>{if(started.current)return;started.current=true;
  void(async()=>{try{const url=new URL(window.location.href),params=new URLSearchParams(url.hash.slice(1));
   let s=params.get('serial')??url.searchParams.get('serial'),c=params.get('code')??url.searchParams.get('code');
   window.history.replaceState(null,'','/claim');
   if(s&&c){const request=capture(s,c);s=null;c=null;await request;}else await load();
  }catch(e){setError(e instanceof Error?e.message:t('تعذر تحميل التفعيل'));}})();
 // Capture the original URL once, also under React Strict Mode.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>{if(journey?.state==='READY'){try{sessionStorage.setItem('activation-draft:'+journey.journeyId,JSON.stringify({vehicle,form}));}catch{}}},[journey,vehicle,form]);
 async function confirm(){if(!journey||busy)return;setBusy(true);setError('');
  try{const r=await fetch('/api/activation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'confirm',journeyId:journey.journeyId,versionId:journey.versionId??null,...(vehicle==='new'?form:{vehicleId:vehicle})})});
   if(r.status===401){router.push('/login?next=/claim');return;}
   const j:Journey=await r.json();
   if(['ACTIVATED','OWNED'].includes(j.state)){setJourney(j);sessionStorage.removeItem('activation-draft:'+journey.journeyId);window.scrollTo({top:0,behavior:'instant'});}else setError(t(messages[j.state]??messages.RETRY));
  }catch{setError(t(messages.RETRY));}finally{setBusy(false);}
 }
 const selected=journey?.vehicles?.find(v=>v.id===vehicle),valid=vehicle==='new'?Object.values(form).every(x=>x.trim()):Boolean(selected&&!selected.occupied);
 return <main className="activation-shell" dir={dir}>
  <header className="activation-header"><Link href="/app?tab=vehicles"><ArrowRight size={20}/>{t('مركباتي')}</Link><DorniBrand/></header>
  <div className="activation-body">
   {!journey&&!error&&<p role="status">{t('جاري تجهيز بطاقتك…')}</p>}
   {journey?.service?<>
    <span className="activation-success"><Check size={32}/></span><h1>{journey.state==='ACTIVATED'?t('تم تفعيل Dorni ✓'):t('هذه البطاقة مرتبطة بحسابك')}</h1>
    {journey.state==='ACTIVATED'?<section className="activation-box"><ServiceFacts service={journey.service}/></section>:<ServiceDetail initial={journey.service}/>}
    <Link className="activation-primary" href="/app?tab=vehicles">{t('الذهاب إلى مركباتي')}</Link>
   </>:journey?.state==='READY'?<>
    <div className="activation-progress" aria-hidden="true"><span className="done"/><span className="done"/><span/></div>
    <span className="activation-step">{t('خطوة واحدة وتصبح جاهزًا')}</span><h1>{t('فعّل Dorni على مركبتك')}</h1>
    <section className="activation-box"><h2>{t('بطاقتك جاهزة')}</h2><dl className="activation-summary"><div><dt>{t('رقم البطاقة')}</dt><dd className="activation-serial">{journey.serial}</dd></div><div><dt>{t('الخدمة المرفقة')}</dt><dd>{t(journey.plan??'')}</dd></div>{journey.duration&&<div><dt>{t('مدة الخدمة')}</dt><dd>{t(serviceDuration(journey.unit,journey.duration))}</dd></div>}</dl><p>{t('تبدأ مدة الخدمة عند تأكيد التفعيل.')}</p></section>
    <form className="activation-box" onSubmit={e=>{e.preventDefault();void confirm();}}><h2>{t('أي مركبة تريد تفعيلها؟')}</h2>
     {journey.vehicles?.map(v=><label key={v.id} className="activation-choice"><input type="radio" name="vehicle" disabled={busy||v.occupied} checked={vehicle===v.id} onChange={()=>setVehicle(v.id)}/><span>{v.manufacturer} {v.model}<small>{v.color}{v.occupied?' — '+t('لديها بطاقة بالفعل'):''}</small></span></label>)}
     {Boolean(journey.vehicles?.length)&&<label className="activation-choice"><input type="radio" name="vehicle" disabled={busy} checked={vehicle==='new'} onChange={()=>setVehicle('new')}/><span>{t('إضافة مركبة جديدة')}</span></label>}
     {vehicle==='new'&&<div className="activation-fields">{(['manufacturer','model','color'] as const).map((field,i)=><label key={field}>{t(['الشركة المصنّعة','الموديل','اللون'][i])}<input required disabled={busy} autoComplete="off" maxLength={field==='color'?40:80} value={form[field]} onChange={e=>setForm({...form,[field]:e.target.value})}/></label>)}</div>}
     {valid&&<p className="activation-notice">{t('سترتبط بطاقتك بـ')} {vehicle==='new'?`${form.manufacturer} ${form.model} — ${form.color}`:`${selected?.manufacturer} ${selected?.model} — ${selected?.color}`} · {t(journey.plan??'')}</p>}
     <button className="activation-primary" disabled={busy||!valid} type="submit">{busy?t('جاري التفعيل…'):t('تفعيل Dorni على هذه المركبة')}<ShieldCheck size={20}/></button>
    </form>
   </>:journey&&<><h1>{t('تفعيل بطاقتك')}</h1><p className="activation-notice">{t(messages[journey.state]??messages.RETRY)}</p><Link href="/app?tab=support">{t('التواصل مع الدعم')}</Link></>}
   {error&&<p className="activation-error" role="alert">{error}</p>}
   {!journey?.service&&<button className="activation-secondary" disabled={busy} onClick={()=>{setError('');void load().catch(()=>setError(t(messages.RETRY)));}}>{t('تحديث حالة البطاقة')}</button>}
   {!journey?.service&&journey?.state!=='READY'&&<button className="activation-secondary" onClick={()=>setManual(!manual)}>{t('إدخال بيانات البطاقة يدويًا')}</button>}
   {manual&&<form className="activation-box" onSubmit={async e=>{e.preventDefault();const s=serial,c=credential;setCredential('');setSerial('');setBusy(true);try{await capture(s,c);}catch(e){setError(e instanceof Error?e.message:t(messages.RETRY));}finally{setBusy(false);}}}>
    <label>{t('رقم البطاقة')}<input required dir="ltr" minLength={6} maxLength={80} value={serial} onChange={e=>setSerial(e.target.value)}/></label>
    <label>{t('رمز التفعيل الخاص')}<input required type="password" autoComplete="off" dir="ltr" minLength={8} maxLength={120} value={credential} onChange={e=>setCredential(e.target.value)}/></label>
    <button disabled={busy} className="activation-primary">{t('متابعة')}</button>
   </form>}
  </div>
 </main>;
}
