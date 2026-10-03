"use client";
import {useCallback,useEffect,useState} from 'react';
import './activation-journey.css';
import {requestJson,errorMessage} from '@/lib/client-api';
type Pending={id:string;serial_number:string;plan:string;created_at:string};
export function RenewalAdmin(){
 const [rows,setRows]=useState<Pending[]>([]),[days,setDays]=useState(7),[reason,setReason]=useState(''),[selected,setSelected]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false);
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);setLoaded(false);setError('');setSelected(null);
  try{
   const j=await requestJson<{data:{requests:Pending[];soonDays:number}}>('/api/service-requests?admin=1',{signal});
   if(signal?.aborted)return;
   setRows(j.data.requests);setDays(j.data.soonDays);setLoaded(true);
  }catch(e){if(!signal?.aborted)setError(errorMessage(e));}
  finally{if(!signal?.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{
  const controller=new AbortController();
  // Start the external request; the shared loader also resets retry UI state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  void load(controller.signal);
  return()=>controller.abort();
 },[load]);
 async function act(payload:object){if(busy||loading||!loaded)return;setBusy(true);setError('');try{const r=await fetch('/api/service-requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(!r.ok)throw Error(j.error);setSelected(null);setReason('');await load();}catch(e){setError(e instanceof Error?e.message:'تعذر التنفيذ');}finally{setBusy(false);}}
 return <div className="ws-stack" dir="rtl"><section className="activation-box"><h2>موعد ظهور «تنتهي قريبًا»</h2><form onSubmit={e=>{e.preventDefault();void act({action:'threshold',days});}}><label>عدد الأيام قبل انتهاء الخدمة<input disabled={busy||loading||!loaded} type="number" min={0} max={365} required value={days} onChange={e=>setDays(Number(e.target.value))}/></label><button disabled={busy||loading||!loaded} className="activation-secondary">حفظ الإعداد</button></form></section><section className="activation-box"><h2>طلبات التجديد بانتظار التأكيد</h2><p>إرسال المستخدم للطلب لا يغير المدة. اعتمد التجديد فقط بعد التحقق الفعلي أو الموافقة الإدارية الموثقة.</p><button className="activation-secondary" disabled={busy||loading} onClick={()=>void load()}>تحديث الطلبات</button>{loading&&<p role="status">جاري تحميل الطلبات…</p>}{loaded&&!loading&&rows.length===0&&<p>لا توجد طلبات معلقة.</p>}{loaded&&!loading&&rows.map(r=><article className="service-mini" key={r.id}><strong dir="ltr">{r.serial_number}</strong><span>{r.plan} · {new Date(r.created_at).toLocaleString('ar-LY')}</span><button className="activation-secondary" disabled={busy||loading||!loaded} onClick={()=>setSelected(r)}>مراجعة الطلب</button></article>)}</section>{selected&&loaded&&!loading&&<section className="activation-box"><h2>مراجعة {selected.serial_number}</h2><p>{selected.plan} — التأكيد يضيف المدة الآن، ولا يرفع أي تعليق إداري.</p><label>مرجع التحقق / سبب القرار<input minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="activation-primary" disabled={busy||loading||!loaded||reason.trim().length<3} onClick={()=>void act({action:'approve',id:selected.id,reason})}>تأكيد التجديد بعد التحقق</button><button className="activation-secondary" disabled={busy||loading||!loaded||reason.trim().length<3} onClick={()=>void act({action:'reject',id:selected.id,reason})}>رفض الطلب</button><button className="activation-secondary" disabled={busy||loading||!loaded} onClick={()=>setSelected(null)}>إلغاء</button></section>}{error&&<p role="alert" className="activation-error">{error}</p>}</div>;
}
