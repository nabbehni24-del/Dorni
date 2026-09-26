"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import {useCallback,useEffect,useMemo,useState} from "react";
import {Building2,Check,ShieldCheck} from "lucide-react";
import {requestJson,errorMessage} from "@/lib/client-api";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

type Action={code:string;label:string;reasons:{code:string;label:string;requiresNote:boolean}[]};
type Context={authenticated:boolean;organizations?:{id:string;name:string}[];selectedOrganizationId?:string|null;availableActions:Action[]};
export function InstitutionalScanPanel({token}:{token:string}){
  const [context,setContext]=useState<Context|null>(null),[organizationId,setOrganizationId]=useState(""),[reason,setReason]=useState(""),[note,setNote]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const load=useCallback(async(org?:string)=>{try{const q=org?`?organizationId=${encodeURIComponent(org)}`:"";const data=await requestJson<Context>(`/api/institutional/scan/${token}${q}`);setContext(data);const selected=data.selectedOrganizationId??org??"";setOrganizationId(selected);const action=data.availableActions.find(a=>a.code==="VEHICLE_MOVE_REQUEST");if(action&&!reason)setReason(action.reasons[0]?.code??"");}catch{/* Anonymous/public behavior remains unchanged. */}},[token,reason]);
  useEffect(()=>{void load();},[load]);
  const action=useMemo(()=>context?.availableActions.find(a=>a.code==="VEHICLE_MOVE_REQUEST"),[context]);
  if(!context?.authenticated)return null;
  if(!action&&context.organizations&&context.organizations.length>1&&!organizationId)return <aside className="institutional-scan-card"><ShieldCheck/><h2>حساب مؤسسي</h2><p>اختر المؤسسة التي تمثلها في هذا الإجراء.</p><select value={organizationId} onChange={e=>{setOrganizationId(e.target.value);void load(e.target.value);}}><option value="">اختر المؤسسة</option>{context.organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></aside>;
  if(!action)return null;
  const selected=action.reasons.find(r=>r.code===reason);
  async function submit(){setBusy(true);setError("");setNotice("");try{const bytes=new Uint8Array(18);crypto.getRandomValues(bytes);const idempotencyKey=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");const result=await requestJson<{action:{referenceNumber:string}}>("/api/institutional/actions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({organizationId,publicToken:token,reasonCode:reason,reasonNote:note||undefined,idempotencyKey})});setNotice(`تم إرسال الطلب الموثق. المرجع: ${result.action.referenceNumber}`);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
  return <aside className="institutional-scan-card" aria-label="إجراء مؤسسي موثق"><div className="institutional-scan-title"><ShieldCheck/><div><b>إجراء مؤسسي موثّق</b><small>هويتك وصلاحيتك تحقق منهما دورني.</small></div></div><h2><Building2/> طلب تحريك المركبة</h2><fieldset><legend>اختر سبب الطلب</legend>{action.reasons.map(r=><label key={r.code}><input type="radio" name="institutional-reason" value={r.code} checked={reason===r.code} onChange={()=>setReason(r.code)}/><span>{r.label}</span></label>)}</fieldset>{selected?.requiresNote&&<Input value={note} onChange={e=>setNote(e.target.value)} minLength={3} maxLength={240} placeholder="اكتب سبباً مختصراً"/>}{error&&<p className="form-error">{error}</p>}{notice?<p className="success-banner"><Check/> {notice}</p>:<Button disabled={busy||!reason||(selected?.requiresNote&&note.trim().length<3)} onClick={submit}>{busy?"جاري الإرسال…":"إرسال طلب موثّق"}</Button>}<small>لن تظهر لك بيانات صاحب المركبة الشخصية.</small></aside>;
}
