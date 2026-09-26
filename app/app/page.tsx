"use client";
import {useLocale} from "@/components/locale-provider";
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-location-assign-relative-destination, @next/next/no-img-element */
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import QRCode from "qrcode";
import Link from "next/link";
import { OwnerHome } from "@/components/owner-home";
import { OwnerDisclosure } from "@/components/owner-disclosure";
import { readOwnerView,ownerViewUrl,type OwnerView } from "@/lib/owner-navigation";
import { OwnerCenter } from "@/components/owner-center";
import { ApiError, requestJson, errorMessage, copyText } from "@/lib/client-api";
import { Home,Bell,BookOpen,CarFront,Check,Copy,Headphones,LogOut,Menu,Plus,QrCode,RefreshCw,Settings,ShieldCheck,X } from "lucide-react";
import { DorniBrand } from "@/components/dorni-brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WebMcpTools } from "@/components/webmcp-tools";
import {OwnerInstitutionalAlerts} from "@/components/owner-institutional-alerts";

type Code={id:string;serial_number:string;public_token:string;activation_state:string};
type Vehicle={id:string;manufacturer:string;model:string;color:string;nickname?:string|null;year?:number|null;code_assignments?:{ended_at:string|null;codes:Code|null}[]};
type Report={id:string;report_type_code:string;status:string;owner_response:string|null;duplicate_count:number;created_at:string;vehicles:{manufacturer:string;model:string;color:string}|null};
type Me={user:{id:string;phone:string|null;email:string|null};profile:{account_status:string;full_name:string|null};vehicles:Vehicle[];reports:Report[];contacts:unknown[];preferences:{primary_channel:string}};
const reportLabel:Record<string,string>={BLOCKING_EXIT:"السيارة تعيق خروجي",PLEASE_MOVE:"الرجاء تحريك السيارة",LIGHTS_ON:"الأنوار ما زالت شغّالة",DOOR_OR_WINDOW_OPEN:"باب أو نافذة مفتوحة",VEHICLE_DAMAGE:"هناك ضرر بالسيارة",URGENT_ATTENTION:"تنبيه عاجل"};
const activeCode=(v:Vehicle)=>v.code_assignments?.find(a=>!a.ended_at)?.codes??null;

export default function OwnerApp(){
 const {t,dir,dateLocale}=useLocale();
  const [data,setData]=useState<Me|null>(null),[tab,setTab]=useState<"account"|"alerts"|"vehicles">("account"),[menu,setMenu]=useState(false),[panel,setPanel]=useState<"support"|"guide"|"privacy"|"settings"|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[incoming,setIncoming]=useState(0),[refreshError,setRefreshError]=useState(""),[busy,setBusy]=useState(false),[form,setForm]=useState({manufacturer:"",model:"",color:"",year:""}),[claim,setClaim]=useState({serialNumber:"",claimCode:"",vehicleId:""}),[qr,setQr]=useState<Record<string,string>>({});
  const [visitedPanels,setVisitedPanels]=useState<Array<"support"|"guide"|"privacy"|"settings">>([]);
  const heading=useRef<HTMLHeadingElement>(null);
  const applyView=useCallback((view:OwnerView)=>{
    if(view==="account"||view==="vehicles"||view==="alerts"){setPanel(null);setTab(view);if(view==="alerts")setIncoming(0);}
    else {setPanel(view);setVisitedPanels(items=>items.includes(view)?items:[...items,view]);}
    setMenu(false);
  },[]);
  const navigate=useCallback((view:OwnerView)=>{
    const next=ownerViewUrl(window.location.href,view);
    if(next!==window.location.pathname+window.location.search+window.location.hash)window.history.pushState(null,"",next);
    applyView(view);window.scrollTo({top:0,behavior:"instant"});
    requestAnimationFrame(()=>heading.current?.focus({preventScroll:true}));
  },[applyView]);
  useEffect(()=>{const restore=()=>applyView(readOwnerView(window.location.search));restore();window.addEventListener("popstate",restore);return()=>window.removeEventListener("popstate",restore);},[applyView]);
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
  useEffect(()=>{void load();},[load]);
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
  if(!data)return <main className="loading-screen" dir={dir}>{error?<><h1>{t("تعذر تحميل حسابك")}</h1><p role="alert">{t(error)}</p><Button onClick={()=>void load()}>{t("إعادة المحاولة")}</Button><Link href="/login">{t("رجوع للدخول")}</Link></>:<><RefreshCw className="spin"/><p>{t("جاري تحميل حسابك...")}</p></>}</main>;

  return <main className="real-owner-page owner-app-shell" dir={dir}><WebMcpTools onChanged={load}/><header className="owner-real-header"><button className="menu-button" onClick={()=>setMenu(true)} aria-label={t("فتح القائمة")}><Menu/></button><DorniBrand href="/app" onClick={e=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();navigate("account");}}}/><span className="owner-header-spacer" aria-hidden="true"/></header>
  {menu&&<div className="owner-drawer"><button className="drawer-backdrop" onClick={()=>setMenu(false)} aria-label={t("إغلاق")}/><aside><button className="drawer-close" onClick={()=>setMenu(false)}><X/></button><DorniBrand href="/app" onClick={e=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();navigate("account");}}}/><div className="drawer-identity"><strong>{data.profile.full_name||t("حساب دورني")}</strong><small dir="ltr">{data.user.email??data.user.phone?.replace(/.(?=.{3})/g,"•")}</small><span>{data.profile.account_status==="ACTIVE"?t("حساب فعّال"):t(data.profile.account_status)} • {data.vehicles.length} {t("سيارات")}</span></div><nav><button onClick={()=>{navigate("support")}}><Headphones/> {t("الدعم الفني")}</button><button onClick={()=>{navigate("guide")}}><BookOpen/> {t("كيفية استخدام دورني")}</button><button onClick={()=>{navigate("privacy")}}><ShieldCheck/> {t("الشروط والخصوصية")}</button><button onClick={()=>{navigate("settings")}}><Settings/> {t("الإعدادات")}</button><button onClick={logout}><LogOut/> {t("تسجيل الخروج")}</button></nav></aside></div>}
  <section className="owner-real-content"><div className="owner-real-lead"><div><p className="eyebrow">{t("حساب صاحب السيارة")}</p><h1 ref={heading} tabIndex={-1}>{panel?panel==="support"?t("الدعم الفني"):panel==="guide"?t("كيفية استخدام دورني"):panel==="privacy"?t("الشروط والخصوصية"):t("الإعدادات"):tab==="vehicles"?t("سياراتي وبطاقاتي"):tab==="alerts"?t("التنبيهات الواردة"):t("أهلاً بيك في دورني")}</h1></div><Badge className="soft-badge"><span className="live-dot"/> {t("حساب فعّال")}</Badge></div>{error&&<div className="form-error block-error" role="alert">{t(error)}</div>}{notice&&<div className="success-banner"><Check/> {t(notice)}</div>}{incoming>0&&<div className="incoming-alert" role="alert"><Bell/><strong>{incoming===1?t("وصلك بلاغ جديد على سيارتك"):t("بلاغات جديدة: {count}",{count:incoming})}</strong><button onClick={()=>{navigate("alerts");}}>{t("عرض التنبيهات")}</button><button className="incoming-dismiss" onClick={()=>setIncoming(0)} aria-label={t("إغلاق التنبيه")}><X/></button></div>}{refreshError&&<p className="refresh-error" role="status">{t(refreshError)}</p>}
  <OwnerInstitutionalAlerts/>
  {visitedPanels.map(p=><section key={p} hidden={panel!==p} className="work-card settings-panel owner-panel"><Button variant="ghost" onClick={()=>navigate("account")}>{t("رجوع للرئيسية")}</Button><OwnerCenter panel={p} name={data.profile.full_name??""} email={data.user.email??""} onChanged={load} onCars={()=>navigate("vehicles")}/></section>)}
  <div hidden={Boolean(panel)}>

  <div hidden={tab!=="vehicles"}><div className="owner-work-grid"><div><OwnerDisclosure title={t("إضافة سيارة")} description={t("بيانات بسيطة، بدون رقم اللوحة")} icon={<Plus/>}><div className="vehicle-form"><Input aria-label={t("الشركة المصنّعة")} maxLength={80} placeholder={t("الشركة")} value={form.manufacturer} onChange={e=>setForm({...form,manufacturer:e.target.value})}/><Input aria-label={t("الموديل")} maxLength={80} placeholder={t("الموديل")} value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/><Input aria-label={t("لون السيارة")} maxLength={40} placeholder={t("اللون")} value={form.color} onChange={e=>setForm({...form,color:e.target.value})}/><Input aria-label={t("سنة السيارة (اختياري)")} type="number" min="1950" max="2100" placeholder={t("السنة (اختياري)")} value={form.year} onChange={e=>setForm({...form,year:e.target.value})}/><Button onClick={createVehicle} disabled={busy||!form.manufacturer||!form.model||!form.color}><Plus/> {t("حفظ السيارة")}</Button></div></OwnerDisclosure>
  <OwnerDisclosure className="claim-card" title={t("تفعيل بطاقة دورني")} description={t("اربط بطاقتك الأصلية بسيارتك")} icon={<QrCode/>}><div className="owner-claim-fields"><Input dir="ltr" placeholder="DRN-LY-000001" value={claim.serialNumber} onChange={e=>setClaim({...claim,serialNumber:e.target.value})}/><Input dir="ltr" placeholder={t("رمز المطالبة السري")} value={claim.claimCode} onChange={e=>setClaim({...claim,claimCode:e.target.value})}/><select aria-label={t("السيارة المراد ربطها بالبطاقة")} value={claim.vehicleId} onChange={e=>setClaim({...claim,vehicleId:e.target.value})}><option value="">{t("اختر السيارة")}</option>{data.vehicles.map(v=><option value={v.id} key={v.id}>{v.manufacturer} {v.model} — {v.color}</option>)}</select><Button onClick={claimCard} disabled={busy||!claim.serialNumber||!claim.claimCode||!claim.vehicleId}>{t("تفعيل وربط البطاقة")}</Button></div></OwnerDisclosure>
  <div className="owner-section-caption"><h2>{t("سياراتك")}</h2><Button variant="ghost" onClick={()=>navigate("settings")}>{t("إدارة السيارات والبطاقات")}</Button></div><div className="vehicle-list">{data.vehicles.length===0&&<p className="owner-inline-empty">{t("ابدأ بإضافة سيارتك من القسم فوق.")}</p>}{data.vehicles.map(v=>{const code=activeCode(v);return <OwnerDisclosure key={v.id} title={v.nickname||`${v.manufacturer} ${v.model}`} description={`${v.color}${v.year?` • ${v.year}`:""} • ${code?(code.activation_state==="ACTIVE"?t("بطاقة فعّالة"):t("بطاقة موقوفة")):t("بانتظار بطاقة")}`} icon={<CarFront/>}><p>{v.manufacturer} {v.model} — {v.color}</p>{code?<><p dir="ltr">{code.serial_number}</p>{code.activation_state==="ACTIVE"&&<><a href={`/t/${code.public_token}`} target="_blank" rel="noreferrer">{t("فتح صفحة البطاقة")}</a><Button variant="outline" onClick={()=>void copyLink(code.public_token)}><Copy/> {t("نسخ الرابط")}</Button></>}</>:<p>{t("فعّل بطاقة من قسم التفعيل فوق.")}</p>}<Button variant="ghost" onClick={()=>navigate("settings")}>{t("تعديل وإدارة السيارة")}</Button></OwnerDisclosure>})}</div></div>
  <aside className="owner-qr-column"><OwnerDisclosure title={t("بطاقاتك وQR")} description={t("بطاقات فعّالة: {count}",{count:activeCodes?.length??0})} icon={<QrCode/>}>{activeCodes?.length?activeCodes.map(code=><div className="active-qr" key={code.id}>{qr[code.id]&&<img src={qr[code.id]} alt={t("رمز QR الخاص بالسيارة")}/>}<b dir="ltr">{code.serial_number}</b><a href={`/t/${code.public_token}`} target="_blank" rel="noreferrer">{t("فتح صفحة المسح")}</a><Button variant="outline" onClick={()=>void copyLink(code.public_token)}><Copy/> {t("نسخ الرابط")}</Button></div>):<div className="empty-code"><QrCode/><p>{t("أضف سيارة ثم فعّل بطاقة دورني أصلية.")}</p></div>}</OwnerDisclosure></aside></div></div>
  <div hidden={tab!=="alerts"}><div className="reports-real-list">{data.reports.length===0?<div className="empty-state"><Bell/><h2>{t("ما فيش تنبيهات توا")}</h2><p>{t("أي بلاغ من بطاقة فعّالة بيظهر هنا مع سجل حالته.")}</p></div>:data.reports.map(r=><OwnerDisclosure key={r.id} title={t(reportLabel[r.report_type_code]??r.report_type_code)} description={`${r.vehicles?.manufacturer??""} ${r.vehicles?.model??""} • ${r.status==="ACTIVE"?t("يحتاج رد"):r.status==="RESOLVED"?t("تم الحل"):r.owner_response?t("تم الرد"):t("مغلق")}`} icon={<Bell/>} initialOpen={r.status==="ACTIVE"}><div><Badge className={r.status==="ACTIVE"?"urgent-badge":"soft-badge"}>{r.status==="ACTIVE"?t("يحتاج رد"):r.status==="RESOLVED"?t("تم الحل"):r.status==="EXPIRED"?t("انتهى البلاغ"):r.owner_response?t("تم الرد"):t("مغلق")}</Badge><h3>{t(reportLabel[r.report_type_code]??r.report_type_code)}</h3><p>{r.vehicles?.manufacturer} {r.vehicles?.model} • {new Date(r.created_at).toLocaleString(dateLocale)}{r.duplicate_count>1?" • "+t("بلاغات مماثلة: {count}",{count:r.duplicate_count}):""}</p></div><div className="report-buttons"><Button disabled={busy||r.status==="RESOLVED"||r.status==="EXPIRED"} onClick={()=>post(`/api/reports/${r.id}/respond`,{response:"ON_MY_WAY"})}>{t("جاي للسيارة")}</Button><Button variant="outline" disabled={busy||r.status==="RESOLVED"||r.status==="EXPIRED"} onClick={()=>post(`/api/reports/${r.id}/respond`,{response:"RESOLVED"})}>{t("تم حل الموضوع")}</Button><Button variant="ghost" disabled={busy||r.status==="RESOLVED"||r.status==="EXPIRED"} onClick={()=>post(`/api/reports/${r.id}/respond`,{response:"CANNOT_REACH_NOW"})}>{t("مش قادر نوصل توا")}</Button></div></OwnerDisclosure>)}</div></div>
  {tab==="account"&&<OwnerHome vehicles={data.vehicles} reports={data.reports} labels={reportLabel} onCars={()=>navigate("vehicles")} onAlerts={()=>navigate("alerts")}/>}
  </div>
  </section><nav className="owner-app-nav" aria-label={t("التنقل الرئيسي")}>{([{view:"account",label:t("الرئيسية"),Icon:Home},{view:"vehicles",label:t("سياراتي"),Icon:CarFront},{view:"alerts",label:t("التنبيهات"),Icon:Bell}] as const).map(({view,label,Icon})=>{const active=!panel&&tab===view;const count=view==="alerts"?data.reports.filter(r=>r.status==="ACTIVE").length:0;return <button key={view} aria-current={active?"page":undefined} onClick={()=>navigate(view)}><span><Icon aria-hidden="true"/>{count>0&&<i aria-label={t("تنبيهات تحتاج ردّك: {count}",{count})}>{count>99?"99+":count}</i>}</span><small>{label}</small></button>;})}</nav></main>;
}
