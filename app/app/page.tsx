"use client";
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-location-assign-relative-destination, @next/next/no-img-element */
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import QRCode from "qrcode";
import Link from "next/link";
import { OwnerCenter } from "@/components/owner-center";
import { ApiError, requestJson, errorMessage, copyText } from "@/lib/client-api";
import { Bell,BookOpen,CarFront,Check,CircleUserRound,Copy,Headphones,LogOut,Menu,Plus,QrCode,RefreshCw,Settings,ShieldCheck,X } from "lucide-react";
import { DorniBrand } from "@/components/dorni-brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WebMcpTools } from "@/components/webmcp-tools";

type Code={id:string;serial_number:string;public_token:string;activation_state:string};
type Vehicle={id:string;manufacturer:string;model:string;color:string;nickname?:string|null;year?:number|null;code_assignments?:{ended_at:string|null;codes:Code|null}[]};
type Report={id:string;report_type_code:string;status:string;owner_response:string|null;duplicate_count:number;created_at:string;vehicles:{manufacturer:string;model:string;color:string}|null};
type Me={user:{id:string;phone:string|null;email:string|null};profile:{account_status:string;full_name:string|null};vehicles:Vehicle[];reports:Report[];contacts:unknown[];preferences:{primary_channel:string}};
const reportLabel:Record<string,string>={BLOCKING_EXIT:"السيارة تعيق خروجي",PLEASE_MOVE:"الرجاء تحريك السيارة",LIGHTS_ON:"الأنوار ما زالت شغّالة",DOOR_OR_WINDOW_OPEN:"باب أو نافذة مفتوحة",VEHICLE_DAMAGE:"هناك ضرر بالسيارة",URGENT_ATTENTION:"تنبيه عاجل"};
const activeCode=(v:Vehicle)=>v.code_assignments?.find(a=>!a.ended_at)?.codes??null;

export default function OwnerApp(){
  const [data,setData]=useState<Me|null>(null),[tab,setTab]=useState<"account"|"alerts"|"vehicles">("vehicles"),[menu,setMenu]=useState(false),[panel,setPanel]=useState<"support"|"guide"|"privacy"|"settings"|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[incoming,setIncoming]=useState(0),[refreshError,setRefreshError]=useState(""),[busy,setBusy]=useState(false),[form,setForm]=useState({manufacturer:"",model:"",color:"",year:""}),[claim,setClaim]=useState({serialNumber:"",claimCode:"",vehicleId:""}),[qr,setQr]=useState<Record<string,string>>({});
  const knownReportCounts=useRef<Map<string,number>|null>(null);
  const acceptReports=useCallback((reports:Report[])=>{
    const previous=knownReportCounts.current;
    if(previous){
      const added=reports.reduce((count,report)=>count+(report.status==="ACTIVE"?Math.max(0,report.duplicate_count-(previous.get(report.id)??0)):0),0);
      if(added>0)setIncoming(count=>count+added);
    }
    knownReportCounts.current=new Map(reports.map(report=>[report.id,report.duplicate_count]));
  },[]);
  const load=useCallback(async()=>{try{const j=await requestJson<Me>("/api/me");acceptReports(j.reports);setData(j);setError("");}catch(e){if(e instanceof ApiError&&e.status===401){window.location.assign("/login");return;}setError(errorMessage(e));}},[acceptReports]);
  useEffect(()=>{if(new URLSearchParams(window.location.search).get("tab")==="alerts")setTab("alerts");void load();},[load]);
  const ready=Boolean(data);
  useEffect(()=>{
    if(!ready)return;
    let alive=true;
    let inFlight=false;
    async function refreshReports(){
      if(!alive||inFlight||document.visibilityState==="hidden")return;
      inFlight=true;
      try{
        const response=await fetch("/api/me/reports",{cache:"no-store",signal:AbortSignal.timeout(15000)});
        if(response.status===401){window.location.assign("/login");return;}
        if(!response.ok)throw new Error("تعذر تحديث التنبيهات تلقائياً");
        const result:{reports:Report[]}=await response.json();
        if(!alive)return;
        acceptReports(result.reports);
        setData(current=>current?{...current,reports:result.reports}:current);
        setRefreshError("");
      }catch{if(alive)setRefreshError("تعذر تحديث التنبيهات تلقائياً؛ سنعيد المحاولة.");}
      finally{inFlight=false;}
    }
    const onVisible=()=>{if(document.visibilityState==="visible")void refreshReports();};
    const onFocus=()=>{void refreshReports();};
    const timer=window.setInterval(()=>{void refreshReports();},5000);
    document.addEventListener("visibilitychange",onVisible);
    window.addEventListener("focus",onFocus);
    window.addEventListener("online",onFocus);
    return()=>{alive=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisible);window.removeEventListener("focus",onFocus);window.removeEventListener("online",onFocus);};
  },[ready,acceptReports]);
  useEffect(()=>{if(!data)return;for(const v of data.vehicles){const code=activeCode(v);if(code&&!qr[code.id])void QRCode.toDataURL(`${window.location.origin}/t/${code.public_token}`,{width:260,margin:2,color:{dark:"#071d2b",light:"#ffffff"}}).then(img=>setQr(q=>({...q,[code.id]:img})));}},[data,qr]);
  const activeCodes=useMemo(()=>data?.vehicles.map(activeCode).filter(c=>c?.activation_state==="ACTIVE") as Code[]|undefined,[data]);
  async function post(url:string,payload:unknown){if(busy)return false;setBusy(true);setError("");setNotice("");try{await requestJson(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});await load();return true;}catch(e){if(e instanceof ApiError&&e.status===401)window.location.assign("/login");setError(errorMessage(e));return false;}finally{setBusy(false);}}
  async function logout(){try{await requestJson("/api/auth/logout",{method:"POST"});window.location.assign("/login");}catch(e){setError(errorMessage(e));}}
  async function copyLink(token:string){try{await copyText(`${location.origin}/t/${token}`);setNotice("تم نسخ رابط البطاقة");}catch(e){setError(errorMessage(e));}}
  async function createVehicle(){if(await post("/api/vehicles",{...form,year:form.year?Number(form.year):undefined})){setForm({manufacturer:"",model:"",color:"",year:""});setNotice("تمت إضافة السيارة");}}
  async function claimCard(){if(await post("/api/codes/claim",claim)){setClaim({serialNumber:"",claimCode:"",vehicleId:""});setNotice("تم تفعيل بطاقة دورني وربطها بالسيارة");}}
  if(!data)return <main className="loading-screen" dir="rtl">{error?<><h1>تعذر تحميل حسابك</h1><p role="alert">{error}</p><Button onClick={()=>void load()}>إعادة المحاولة</Button><Link href="/login">رجوع للدخول</Link></>:<><RefreshCw className="spin"/><p>جاري تحميل حسابك...</p></>}</main>;
  const accountIdentifier=data.user.email??data.user.phone??"حساب موثّق";
  return <main className="real-owner-page" dir="rtl"><WebMcpTools onChanged={load}/><header className="owner-real-header"><button className="menu-button" onClick={()=>setMenu(true)} aria-label="فتح القائمة"><Menu/></button><DorniBrand/><div><span className="phone-chip">{accountIdentifier}</span><button onClick={logout} aria-label="تسجيل الخروج"><LogOut/></button></div></header>
  {menu&&<div className="owner-drawer"><button className="drawer-backdrop" onClick={()=>setMenu(false)} aria-label="إغلاق"/><aside><button className="drawer-close" onClick={()=>setMenu(false)}><X/></button><DorniBrand/><div className="drawer-identity"><strong>{data.profile.full_name||"حساب دورني"}</strong><small dir="ltr">{data.user.email??data.user.phone?.replace(/.(?=.{3})/g,"•")}</small><span>{data.profile.account_status==="ACTIVE"?"حساب فعّال":data.profile.account_status} • {data.vehicles.length} سيارات</span></div><nav><button onClick={()=>{setPanel("support");setMenu(false)}}><Headphones/> الدعم الفني</button><button onClick={()=>{setPanel("guide");setMenu(false)}}><BookOpen/> كيفية استخدام دورني</button><button onClick={()=>{setPanel("privacy");setMenu(false)}}><ShieldCheck/> الشروط والخصوصية</button><button onClick={()=>{setPanel("settings");setMenu(false)}}><Settings/> الإعدادات</button><button onClick={logout}><LogOut/> تسجيل الخروج</button></nav></aside></div>}
  <section className="owner-real-content"><div className="owner-real-lead"><div><p className="eyebrow">حساب صاحب السيارة</p><h1>{panel?panel==="support"?"الدعم الفني":panel==="guide"?"كيفية استخدام دورني":panel==="privacy"?"الشروط والخصوصية":"الإعدادات":tab==="vehicles"?"سياراتي وبطاقاتي":tab==="alerts"?"التنبيهات الواردة":"بياناتي"}</h1></div><Badge className="soft-badge"><span className="live-dot"/> حساب فعّال</Badge></div>{error&&<div className="form-error block-error" role="alert">{error}</div>}{notice&&<div className="success-banner"><Check/> {notice}</div>}{incoming>0&&<div className="incoming-alert" role="alert"><Bell/><strong>{incoming===1?"وصلك بلاغ جديد على سيارتك":`وصلك ${incoming} بلاغات جديدة على سيارتك`}</strong><button onClick={()=>{setPanel(null);setTab("alerts");setIncoming(0);}}>عرض التنبيهات</button><button className="incoming-dismiss" onClick={()=>setIncoming(0)} aria-label="إغلاق التنبيه"><X/></button></div>}{refreshError&&<p className="refresh-error" role="status">{refreshError}</p>}
  {panel?<section className="work-card settings-panel"><Button variant="ghost" onClick={()=>setPanel(null)}>رجوع للحساب</Button><OwnerCenter key={panel} panel={panel} name={data.profile.full_name??""} email={data.user.email??""} onChanged={load} onCars={()=>{setPanel(null);setTab("vehicles");}}/></section>:<>
  <nav className="real-tabs"><button className={tab==="account"?"active":""} onClick={()=>setTab("account")}><CircleUserRound/> بياناتي</button><button className={tab==="alerts"?"active":""} onClick={()=>setTab("alerts")}><Bell/> التنبيهات <i>{data.reports.filter(r=>r.status==="ACTIVE").length}</i></button><button className={tab==="vehicles"?"active":""} onClick={()=>setTab("vehicles")}><CarFront/> سياراتي</button></nav>
  {tab==="vehicles"&&<div className="owner-work-grid"><div><article className="work-card"><div className="card-heading"><div><h2>إضافة سيارة</h2><p>المعلومات العامة فقط، لوحة السيارة غير مطلوبة</p></div><Plus/></div><div className="vehicle-form"><Input aria-label="الشركة المصنّعة" maxLength={80} placeholder="الشركة" value={form.manufacturer} onChange={e=>setForm({...form,manufacturer:e.target.value})}/><Input aria-label="الموديل" maxLength={80} placeholder="الموديل" value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/><Input aria-label="لون السيارة" maxLength={40} placeholder="اللون" value={form.color} onChange={e=>setForm({...form,color:e.target.value})}/><Input aria-label="سنة السيارة (اختياري)" type="number" min="1950" max="2100" placeholder="السنة (اختياري)" value={form.year} onChange={e=>setForm({...form,year:e.target.value})}/><Button onClick={createVehicle} disabled={busy||!form.manufacturer||!form.model||!form.color}><Plus/> حفظ السيارة</Button></div></article>
  <article className="work-card claim-card"><div className="card-heading"><div><h2>تفعيل بطاقة دورني</h2><p>الرمز تحت طبقة الكشط يُستخدم مرة واحدة</p></div><QrCode/></div><Input dir="ltr" placeholder="DRN-LY-000001" value={claim.serialNumber} onChange={e=>setClaim({...claim,serialNumber:e.target.value})}/><Input dir="ltr" placeholder="رمز المطالبة السري" value={claim.claimCode} onChange={e=>setClaim({...claim,claimCode:e.target.value})}/><select aria-label="السيارة المراد ربطها بالبطاقة" value={claim.vehicleId} onChange={e=>setClaim({...claim,vehicleId:e.target.value})}><option value="">اختر السيارة</option>{data.vehicles.map(v=><option value={v.id} key={v.id}>{v.manufacturer} {v.model} — {v.color}</option>)}</select><Button onClick={claimCard} disabled={busy||!claim.serialNumber||!claim.claimCode||!claim.vehicleId}>تفعيل وربط البطاقة</Button></article>
  <div className="vehicle-list">{data.vehicles.map(v=>{const code=activeCode(v);return <article className="vehicle-real-card" key={v.id}><span><CarFront/></span><div><h3>{v.manufacturer} {v.model}</h3><p>{v.color}{v.year?` • ${v.year}`:""}</p>{code&&<small dir="ltr">{code.serial_number}</small>}</div>{code?<Badge className="soft-badge"><Check/> {code.activation_state==="ACTIVE"?"مفعّل":"موقوف"}</Badge>:<Badge variant="outline">بانتظار بطاقة</Badge>}</article>})}</div></div>
  <aside className="qr-live-card"><div className="card-heading"><div><h2>بطاقاتك الفعّالة</h2><p>بطاقات مرتبطة بسياراتك ومحفوظة في حسابك</p></div><ShieldCheck/></div>{activeCodes?.length?activeCodes.map(code=><div className="active-qr" key={code.id}>{qr[code.id]&&<img src={qr[code.id]} alt="رمز QR الخاص بالسيارة"/>}<b dir="ltr">{code.serial_number}</b><a href={`/t/${code.public_token}`} target="_blank" rel="noreferrer">فتح صفحة المسح</a><Button variant="outline" onClick={()=>void copyLink(code.public_token)}><Copy/> نسخ الرابط</Button></div>):<div className="empty-code"><QrCode/><p>أضف سيارة ثم فعّل بطاقة دورني أصلية.</p></div>}</aside></div>}
  {tab==="alerts"&&<div className="reports-real-list">{data.reports.length===0?<div className="empty-state"><Bell/><h2>ما فيش تنبيهات توا</h2><p>أي بلاغ من بطاقة فعّالة بيظهر هنا مع سجل حالته.</p></div>:data.reports.map(r=><article key={r.id}><div><Badge className={r.status==="ACTIVE"?"urgent-badge":"soft-badge"}>{r.status==="ACTIVE"?"يحتاج رد":r.status==="RESOLVED"?"تم الحل":r.status==="EXPIRED"?"انتهى البلاغ":r.owner_response?"تم الرد":"مغلق"}</Badge><h3>{reportLabel[r.report_type_code]??r.report_type_code}</h3><p>{r.vehicles?.manufacturer} {r.vehicles?.model} • {new Date(r.created_at).toLocaleString("ar-LY")}{r.duplicate_count>1?` • ${r.duplicate_count} بلاغات مماثلة`:""}</p></div><div className="report-buttons"><Button disabled={busy||r.status==="RESOLVED"||r.status==="EXPIRED"} onClick={()=>post(`/api/reports/${r.id}/respond`,{response:"ON_MY_WAY"})}>جاي للسيارة</Button><Button variant="outline" disabled={busy||r.status==="RESOLVED"||r.status==="EXPIRED"} onClick={()=>post(`/api/reports/${r.id}/respond`,{response:"RESOLVED"})}>تم حل الموضوع</Button><Button variant="ghost" disabled={busy||r.status==="RESOLVED"||r.status==="EXPIRED"} onClick={()=>post(`/api/reports/${r.id}/respond`,{response:"CANNOT_REACH_NOW"})}>مش قادر نوصل توا</Button></div></article>)}</div>}
  {tab==="account"&&<div className="account-grid"><article className="account-real-card"><span><CircleUserRound/></span><div><p>{data.user.email?"البريد الإلكتروني الموثّق":"رقم الهاتف الموثّق"}</p><h2 dir="ltr">{accountIdentifier}</h2><small>حالة الحساب: {data.profile.account_status}</small></div></article><article className="account-real-card"><span><CarFront/></span><div><p>ملخص الحساب</p><h2>{data.vehicles.length} سيارات • {activeCodes?.length??0} بطاقات فعّالة</h2><small>{data.reports.length} تنبيهات محفوظة في السجل</small></div></article></div>}</>}
  </section></main>;
}

