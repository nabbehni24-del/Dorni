"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import {useCallback,useEffect,useState} from "react";
import {Building2,Check,Copy,RefreshCw,Send,ShieldCheck,UserRoundPlus,Users} from "lucide-react";
import {requestJson,errorMessage} from "@/lib/client-api";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";

type Overview={organization:{id:string;name:string;status:string;institutionalEnabled:boolean};metrics:{total?:number;acknowledged?:number;completed?:number;unacknowledged?:number};actions:{id:string;referenceNumber:string;reasonCode:string;status:string;createdAt:string}[];members:{id:string;name:string|null;email:string|null;status:string;roleId:string|null;actionCount:number;lastActivity:string|null}[];roles:{id:string;code:string;name:string;systemRole:boolean;permissions:string[]}[];entitlements:string[]};
const permissionLabels:Record<string,string>={ORG_MEMBER_VIEW:"عرض الموظفين",ORG_MEMBER_INVITE:"دعوة موظف",ORG_MEMBER_SUSPEND:"إيقاف موظف",ORG_ROLE_ASSIGN:"إدارة الأدوار",ORG_AUDIT_VIEW:"عرض التدقيق",ORG_REPORT_VIEW:"عرض التقارير",VEHICLE_MOVE_REQUEST:"طلب تحريك مركبة"};
const reasonLabels:Record<string,string>={BLOCKING_ACCESS:"تعيق الوصول أو الخروج",OBSTRUCTING_TRAFFIC:"تعرقل حركة المرور",SAFETY_REASON:"سبب متعلق بالسلامة",OTHER:"سبب آخر"};

export function InstitutionalWorkspace({organizationId}:{organizationId:string}){
  const [data,setData]=useState<Overview|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[inviteUrl,setInviteUrl]=useState("");
  const [invite,setInvite]=useState({email:"",roleId:""}),[role,setRole]=useState({code:"FIELD_AGENT",name:"موظف ميداني",permissions:["VEHICLE_MOVE_REQUEST"] as string[]});
  const load=useCallback(async()=>{try{setData(await requestJson<Overview>(`/api/institutional/overview?organizationId=${encodeURIComponent(organizationId)}`));setError("");}catch(e){setError(errorMessage(e));}},[organizationId]);
  useEffect(()=>{void load();},[load]);
  async function post(url:string,payload:unknown){setBusy(true);setError("");setNotice("");try{await requestJson(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});await load();return true;}catch(e){setError(errorMessage(e));return false;}finally{setBusy(false);}}
  if(!data&&!error)return <article className="work-card institutional-panel"><RefreshCw className="spin"/> جاري تحميل مساحة المؤسسة…</article>;
  if(!data)return <article className="work-card institutional-panel"><ShieldCheck/><h2>الخدمات المؤسسية غير متاحة</h2><p>{error}</p></article>;
  if(!data.organization.institutionalEnabled)return null;
  const assignable=data.roles.filter(r=>r.code!=="PARTNER_ADMIN");
  return <section className="institutional-workspace" aria-label="مساحة المؤسسة الموثقة">
    <div className="institutional-title"><div><ShieldCheck/><span><b>مؤسسة موثقة عبر دورني</b><small>الصلاحيات تمنحها دورني وتوزعها المؤسسة عبر الأدوار.</small></span></div><Badge>موثقة</Badge></div>
    {error&&<p className="form-error">{error}</p>}{notice&&<p className="success-banner"><Check/> {notice}</p>}
    <div className="metric-grid"><article><Send/><b>{data.metrics.total??0}</b><span>إجراءات</span></article><article><Check/><b>{data.metrics.acknowledged??0}</b><span>تم الاطلاع</span></article><article><Users/><b>{data.members.length}</b><span>موظفون</span></article></div>
    <div className="portal-grid">
      <article className="work-card admin-form"><h2>إنشاء دور ميداني</h2><Input value={role.name} onChange={e=>setRole({...role,name:e.target.value})}/><Input dir="ltr" value={role.code} onChange={e=>setRole({...role,code:e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,"")})}/><div className="permission-list">{data.entitlements.map(p=><label key={p}><input type="checkbox" checked={role.permissions.includes(p)} onChange={e=>setRole({...role,permissions:e.target.checked?[...role.permissions,p]:role.permissions.filter(x=>x!==p)})}/>{permissionLabels[p]??p}</label>)}</div><Button disabled={busy||!role.name||!role.code} onClick={async()=>{if(await post("/api/institutional/roles",{organizationId,roleId:null,...role}))setNotice("تم إنشاء الدور بصلاحيات ضمن تخويل المؤسسة.");}}>حفظ الدور</Button></article>
      <article className="work-card admin-form"><h2><UserRoundPlus/> دعوة موظف</h2><Input type="email" dir="ltr" placeholder="employee@example.com" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})}/><select value={invite.roleId} onChange={e=>setInvite({...invite,roleId:e.target.value})}><option value="">اختر الدور</option>{assignable.map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</select><Button disabled={busy||!invite.email||!invite.roleId} onClick={async()=>{setBusy(true);setError("");setNotice("");setInviteUrl("");try{const response=await requestJson<{invitation:{url:string}}>("/api/institutional/members",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"invite",organizationId,...invite})});setInviteUrl(response.invitation.url);setInvite({email:"",roleId:""});setNotice("تم إنشاء دعوة آمنة للموظف. انسخ الرابط وأرسله له.");await load();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}}><UserRoundPlus/> إنشاء الدعوة</Button>{inviteUrl&&<div className="invite-link"><Input value={inviteUrl} dir="ltr" readOnly/><Button type="button" variant="outline" onClick={async()=>{await navigator.clipboard.writeText(inviteUrl);setNotice("تم نسخ رابط الدعوة.");}}><Copy/> نسخ الرابط</Button></div>}</article>
    </div>
    <article className="work-card"><h2>الموظفون</h2>{data.members.map(m=><div className="list-row" key={m.id}><div><b>{m.name||m.email||"موظف"}</b><p>{m.actionCount} إجراء {m.lastActivity?`• آخر نشاط ${new Date(m.lastActivity).toLocaleString("ar-LY")}`:""}</p></div><div className="member-actions"><Badge variant="outline">{m.status}</Badge><Button variant="ghost" disabled={busy} onClick={()=>void post("/api/institutional/members",{action:"status",organizationId,membershipId:m.id,status:m.status==="ACTIVE"?"SUSPENDED":"ACTIVE"})}>{m.status==="ACTIVE"?"إيقاف":"إعادة تفعيل"}</Button></div></div>)}</article>
    <article className="work-card"><h2><Building2/> آخر طلبات التحريك</h2>{data.actions.length?data.actions.map(a=><div className="list-row" key={a.id}><div><b dir="ltr">{a.referenceNumber}</b><p>{reasonLabels[a.reasonCode]??a.reasonCode} • {new Date(a.createdAt).toLocaleString("ar-LY")}</p></div><Badge>{a.status}</Badge></div>):<p>لا توجد إجراءات في الفترة المحددة.</p>}</article>
  </section>;
}
