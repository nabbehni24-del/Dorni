"use client";
import {useCallback,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {requestJson,errorMessage} from '@/lib/client-api';
import {batchRequestKey,completeBatchRequest} from '@/lib/batch-request-key';
import {standardBalance,type CodeInventory} from '@/lib/code-inventory';

export function CodeInventoryPanel({organizationId,manage=false,refreshKey=''}:{organizationId:string;manage?:boolean;refreshKey?:string}){
 const [inventory,setInventory]=useState<CodeInventory|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [quantity,setQuantity]=useState('200'),[reference,setReference]=useState(''),[revoking,setRevoking]=useState(''),[reason,setReason]=useState('');
 const load=useCallback(async()=>{const r=await requestJson<{inventory:CodeInventory}>(`/api/commercial?organizationId=${encodeURIComponent(organizationId)}`);setInventory(r.inventory);},[organizationId]);
 useEffect(()=>{let active=true;void requestJson<{inventory:CodeInventory}>(`/api/commercial?organizationId=${encodeURIComponent(organizationId)}`).then(r=>{if(active){setInventory(r.inventory);setError('');}}).catch(e=>{if(active)setError(errorMessage(e));});return()=>{active=false;};},[organizationId,refreshKey]);
 const balance=inventory?.organizationId===organizationId?standardBalance(inventory):null;
 async function submit(){
  if(busy)return;setBusy(true);setError('');setNotice('');
  const scope=JSON.stringify(['grant',organizationId,Number(quantity),reference.trim()]);
  try{
   await requestJson('/api/commercial',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(revoking?{action:'revokeGrant',grantId:revoking,reason}:{action:'grant',organizationId,quantity:Number(quantity),reference,requestKey:batchRequestKey(scope)})});
   if(!revoking)completeBatchRequest(scope);
   setNotice(revoking?'أُلغي الجزء غير المستخدم فقط؛ الأكواد الصادرة لم تتغيّر.':'تم اعتماد رصيد الأكواد.');setRevoking('');setReason('');await load();
  }catch(e){setError(errorMessage(e));}finally{setBusy(false);}
 }
 return <section className="ws-panel" aria-label="رصيد أكواد الشركة">
  <div className="ws-toolbar"><h2>رصيد أكواد الشركة</h2><Button variant="outline" disabled={busy} onClick={()=>void load().catch(e=>setError(errorMessage(e)))}>تحديث الرصيد</Button></div>
  {error&&<p role="alert" className="form-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {balance&&<><div className="ws-kpis">{[['المعتمد',balance.granted],['الصادر',balance.issued],['المتبقي',balance.remaining],['الملغى قبل الإصدار',balance.revoked]].map(([label,value])=><article key={label}><small>{label}</small><strong>{value}</strong></article>)}</div><p>الأكواد التاريخية: {inventory?.legacyIssued??0} — منفصلة عن الرصيد التجاري.</p></>}
  {manage&&<form onSubmit={e=>{e.preventDefault();void submit();}}>
   {revoking?<><h3>إلغاء الرصيد غير المستخدم</h3><label>سبب الإلغاء<input required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><Button type="button" variant="outline" onClick={()=>setRevoking('')}>تراجع</Button></>:<><h3>منح رصيد صريح</h3><div className="form-pair"><label>عدد الأكواد<input required type="number" min={1} max={1000000} step={1} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label>مرجع الطلب أو التخويل<input required minLength={3} maxLength={160} value={reference} onChange={e=>setReference(e.target.value)}/></label></div><p>اعتماد رصيد STANDARD_CARD لا ينشئ بطاقات ولا يحدد مدة خدمة، وليس تأكيد دفع آليًا.</p></>}
   <Button disabled={busy}>{busy?'جاري التنفيذ…':revoking?'تأكيد إلغاء المتبقي':'اعتماد الرصيد'}</Button>
  </form>}
  {inventory?.organizationId===organizationId&&<details><summary>سجل المنح — آخر 200 عملية</summary>{inventory.grants.map(g=><article key={g.id} className="ws-toolbar"><span>{g.reference} · {g.product_type} · {g.consumed}/{g.quantity} صادر {g.revoked_at?'· أُلغي المتبقي':''}</span>{manage&&!g.revoked_at&&g.quantity>g.consumed&&<Button variant="outline" disabled={busy} onClick={()=>{setRevoking(g.id);setReason('');}}>إلغاء المتبقي</Button>}</article>)}</details>}
 </section>;
}
