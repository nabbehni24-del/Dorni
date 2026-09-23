"use client";
import {ArrowLeft,Bell,CarFront,Plus,QrCode} from 'lucide-react';

type Vehicle={id:string;manufacturer:string;model:string;color:string;nickname?:string|null;code_assignments?:{ended_at:string|null;codes:{activation_state:string}|null}[]};
type Report={id:string;status:string;report_type_code:string;created_at:string;vehicles:{manufacturer:string;model:string}|null};
export function OwnerHome({vehicles,reports,labels,onCars,onAlerts}:{vehicles:Vehicle[];reports:Report[];labels:Record<string,string>;onCars:()=>void;onAlerts:()=>void}){
 const pending=reports.filter(r=>r.status==='ACTIVE').sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 return <div className="owner-home">
  <section className={`home-attention ${pending.length?'has-alerts':''}`} aria-labelledby="home-attention-title">
   <span className="home-attention-icon"><Bell aria-hidden="true"/></span>
   <div><p className="eyebrow">تنبيهات سيارتك</p><h2 id="home-attention-title">{pending.length?`${pending.length} تنبيهات تحتاج ردّك`:'ما عندكش تنبيهات معلّقة'}</h2><p>{pending.length?'راجع البلاغات الواردة وردّ على صاحب البلاغ.':'أي بلاغ جديد على بطاقتك يظهر هنا.'}</p></div>
   {pending.length>0&&<button className="home-primary" onClick={onAlerts}>عرض التنبيهات <ArrowLeft aria-hidden="true"/></button>}
  </section>
  {pending.length>0&&<section className="home-recent" aria-label="أحدث التنبيهات">{pending.slice(0,3).map(r=><button key={r.id} className="home-report" onClick={onAlerts}><Bell aria-hidden="true"/><span><strong>{labels[r.report_type_code]??'تنبيه على السيارة'}</strong><small>{r.vehicles?`${r.vehicles.manufacturer} ${r.vehicles.model}`:'سيارتك'} · {new Date(r.created_at).toLocaleString('ar-LY')}</small></span><ArrowLeft aria-hidden="true"/></button>)}</section>}
  <section aria-labelledby="home-cars-title"><div className="home-section-heading"><h2 id="home-cars-title">سياراتك</h2>{vehicles.length>0&&<button onClick={onCars}>عرض الكل <ArrowLeft aria-hidden="true"/></button>}</div>
   {vehicles.length===0?<div className="home-start"><CarFront aria-hidden="true"/><h3>ابدأ بسيارتك</h3><p>أضف بيانات السيارة، وبعدها اربط بطاقة دورني لاستقبال البلاغات عليها.</p><button className="home-primary" onClick={onCars}><Plus aria-hidden="true"/> إضافة سيارة</button></div>:<div className="home-cars">{vehicles.slice(0,3).map(v=>{const card=v.code_assignments?.find(a=>!a.ended_at)?.codes;const active=card?.activation_state==='ACTIVE';return <button className="home-car" key={v.id} onClick={onCars}><span className="home-car-icon"><CarFront aria-hidden="true"/></span><span><strong>{v.nickname||`${v.manufacturer} ${v.model}`}</strong><small>{v.color}</small><span className={`home-card-status ${active?'is-active':''}`}><QrCode aria-hidden="true"/>{active?'البطاقة فعّالة':card?'البطاقة غير فعّالة':'تحتاج تفعيل بطاقة'}</span></span><ArrowLeft aria-hidden="true"/></button>})}</div>}
  </section>
 </div>;
}
