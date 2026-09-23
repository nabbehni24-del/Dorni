"use client";
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-location-assign-relative-destination, @next/next/no-img-element */
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import QRCode from "qrcode";
import Link from "next/link";
import { OwnerDisclosure } from "@/components/owner-disclosure";
import { readOwnerView,ownerViewUrl,type OwnerView } from "@/lib/owner-navigation";
import { OwnerCenter } from "@/components/owner-center";
import { ApiError, requestJson, errorMessage, copyText } from "@/lib/client-api";
import { Home,Bell,BookOpen,CarFront,Check,CircleUserRound,Copy,Headphones,LogOut,Menu,Plus,QrCode,RefreshCw,Settings,ShieldCheck,X } from "lucide-react";
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
  if(!data)return <main className="loading-screen" dir="rtl">{error?<><h1>تعذر تحميل حسابك</h1><p role="alert">{error}</p><Button onClick={()=>void load()}>إعادة المحاولة</Button><Link href="/login">رجوع للدخول</Link></>:<><RefreshCw className="spin"/><p>جاري تحميل حسابك...</p></>}</main>;
  const accountIdentifier=data.user.email??data.user.phone??"حساب موثّق";
  return <main className="real-owner-page owner-app-shell" dir="rtl"><WebMcpTools onChanged={load}/><header className="owner-real-header"><button className="menu-button" onClick={()=>setMenu(true)} aria-label="فتح القائمة"><Menu/></button><DorniBrand/><div><span className="phone-chip">{accountIdentifier}</span><button onClick={logout} aria-label="تسجيل الخروج"><LogOut/></button></div></header>
  {menu&&<div className="owner-drawer"><button className="drawer-backdrop" onClick={()=>setMenu(false)} aria-label="إغلاق"/><aside><button className="drawer-close" onClick={()=>setMenu(false)}><X/></button><DorniBrand/><div className="drawer-identity"><strong>{data.profile.full_name||"حساب دورني"}</strong><small dir="ltr">{data.user.email??data.user.phone?.replace(/.(?=.{3})/g,"•")}</small><span>{data.profile.account_status==="ACTIVE"?"حساب فعّال":data.profile.account_status} • {data.vehicles.length} سيارات</span></div><nav><button onClick={()=>{navigate("support")}}><Headphones/> الدعم الفني</button><button onClick={()=>{navigate("guide")}}><BookOpen/> كيفية استخدام دورني</button><button onClick={()=>{navigate("privacy")}}><ShieldCheck/> الشروط والخصوصية</button><button onClick={()=>{navigate("settings")}}><Settings/> الإعدادات</button><button onClick={logout}><LogOut/> تسجيل الخروج</button></nav></aside></div>}
  <section className="owner-real-content"><div className="owner-real-lead"><div><p className="eyebrow">حساب صاحب السيارة</p><h1 ref={heading} tabIndex={-1}>{panel?panel==="support"?"الدعم الفني":panel==="guide"?"كيفية استخدام دورني":panel==="privacy"?"الشروط والخصوصية":"الإعدادات":tab==="vehicles"?"سياراتي وبطاقاتي":tab==="alerts"?"التنبيهات الواردة":"أهلاً بيك في دورني"}</h1></div><Badge className="soft-badge"><span className="live-dot"/> حساب فعّال</Badge></div>{error&&<div className="form-error block-error" role="alert">{error}</div>}{notice&&<div className="success-banner"><Check/> {notice}</div>}{incoming>0&&<div className="incoming-alert" role="alert"><Bell/><strong>{incoming===1?"وصلك بلاغ جديد على سيارتك":`وصلك ${incoming} بلاغات جديدة على سيارتك`}</strong><button onClick={()=>{navigate("alerts");}}>عرض التنبيهات</button><button className="incoming-dismiss" onClick={()=>setIncoming(0)} aria-label="إغلاق التنبيه"><X/></button></div>}{refreshError&&<p className="refresh-error" role="status">{refreshError}</p>}
  {visitedPanels.map(p=><section key={p} hidden={panel!==p} className="work-card settings-panel owner-panel"><Button variant="ghost" onClick={()=>navigate("account")}>رجوع للرئيسية</Button><OwnerCenter panel={p} name={data.profile.full_name??""} email={data.user.email??""} onChanged={load} onCars={()=>navigate("vehicles")}/></section>)}
  <div hidden={Boolean(panel)}>

  <div hidden={tab!=="vehicles"}><div className="owner-work-grid"><div><OwnerDisclosure title="إضافة سيارة" description="بيانات بسيطة، بدون رقم اللوحة" icon={<Plus/>}><div className="vehicle-form"><Input aria-label="الشركة المصنّعة" maxLength={80} placeholder="الشركة" value={form.manufacturer} onChange={e=>setForm({...form,manufacturer:e.target.value})}/><Input aria-label="الموديل" maxLength={80} placeholder="الموديل" value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/><Input aria-label="لون السيارة" maxLength={40} placeholder="اللون" value={form.color} onChange={e=>setForm({...form,color:e.target.value})}/><Input aria-label="سنة السيارة (اختياري)" type="number" min="1950" max="2100" placeholder="السنة (اختياري)" value={form.year} onChange={e=>setForm({...form,year:e.target.value})}/><Button onClick={createVehicle} disabled={busy||!form.manufacturer||!form.model||!form.color}><Plus/> حفظ السيارة</Button></div></OwnerDisclosure>
  <OwnerDisclosure className="claim-card" title="تفعيل بطاقة دورني" description="اربط بطاقتك الأصلية بسيارتك" icon={<QrCode/>}><div className="owner-claim-fields"><Input dir="ltr" placeholder="DRN-LY-000001" value={claim.serialNumber} onChange={e=>setClaim({...claim,serialNumber:e.target.value})}/><Input dir="ltr" placeholder="رمز المطالبة السري" value={claim.claimCode} onChange={e=>setClaim({...claim,claimCode:e.target.value})}/><select aria-label="السيارة المراد ربطها بالبطاقة" value={claim.vehicleId} onChange={e=>setClaim({...claim,vehicleId:e.target.value})}><option value="">اختر السيارة</option>{data.vehicles.map(v=><option value={v.id} key={v.id}>{v.manufacturer} {v.model} — {v.color}</option>)}</select><Button onClick={claimCard} disabled={busy||!claim.serialNumber||!claim.claimCode||!claim.vehicleId}>تفعيل وربط البطاقة</Button></div></OwnerDisclosure>
  <div className="owner-section-caption"><h2>سياراتك</h2><Button variant="ghost" onClick={()=>navigate("settings")}>إدارة السيارات والبطاقات</Button></div><div className="vehicle-list">{data.vehicles.length===0&&<p className="owner-inline-empty">ابدأ بإضافة سيارتك من القسم فوق.</p>}{data.vehicles.map(v=>{const code=activeCode(v);return <OwnerDisclosure key={v.id} title={v.nickname||`${v.manufacturer} ${v.model}`} description={`${v.color}${v.year?` • ${v.year}`:""} • ${code?(code.activation_state==="ACTIVE"?"بطاقة فعّالة":"بطاقة موقوفة"):"بانتظار بطاقة"}`} icon={<CarFront/>}><p>{v.manufacturer} {v.model} — {v.color}</p>{code?<><p dir="ltr">{code.serial_number}</p>{code.activation_state==="ACTIVE"&&<><a href={`/t/${code.public_token}`} target="_blank" rel="noreferrer">فتح صفحة البطاقة</a><Button variant="outline" onClick={()=>void copyLink(code.public_token)}><Copy/> نسخ الرابط</Button></>}</>:<p>فعّل بطاقة من قسم التفعيل فوق.</p>}<Button variant="ghost" onClick={()=>navigate("settings")}>تعديل وإدارة السيارة</Button></OwnerDisclosure>})}</div></div>
  <aside className="owner-qr-column"><OwnerDisclosure title="بطاقاتك وQR" description={`${activeCodes?.length??0} بطاقات فعّالة — اضغط للعرض`} icon={<QrCode/>}>{activeCodes?.length?activeCodes.map(code=><div className="active-qr" key={code.id}>{qr[code.id]&&<img src={qr[code.id]} alt="رمز QR الخاص بالسيارة"/>}<b dir="ltr">{code.serial_number}</b><a href={`/t/${code.public_token}`} target="_blank" rel="noreferrer">فتح صفحة المسح</a><Button variant="outline" onClick={()=>void copyLink(code.public_token)}><Copy/> نسخ الرابط</Button></div>):<div className="empty-code"><QrCode/><p>أضف سيارة ثم فعّل بطاقة دورني أصلية.</p></div>}</OwnerDisclosure></aside></div></div>
  <div hidden={tab!=="alerts"}><div className="reports-real-list">{data.reports.length===0?<div className="empty-state"><Bell/><h2>ما فيش تنبيهات توا</h2><p>أي بلاغ من بطاقة فعّالة بيظهر هنا مع سجل حالته.</p></div>:data.reports.map(r=><OwnerDisclosure key={r.id} title={reportLabel[r.report_type_code]??r.report_type_code} description={`${r.vehicles?.manufacturer??""} ${r.vehicles?.model??""} • ${r.status==="ACTIVE"?"يحتاج رد":r.status==="RESOLVED"?"تم الحل":r.owner_response?"تم الرد":"مغلق"}`} icon={<Bell/>} initialOpen={r.status==="ACTIVE"}><div><Badge className={r.status==="ACTIVE"?"urgent-badge":"soft-badge"}>{r.status==="ACTIVE"?"يحتاج رد":r.status==="RESOLVED"?"تم الحل":r.status==="EXPIRED"?"انتهى البلاغ":r.owner_response?"تم الرد":"مغلق"}</Badge><h3>{reportLabel[r.report_type_code]??r.report_type_code}</h3><p>{r.vehicles?.manufacturer} {r.vehicles?.model} • {new Date(r.created_at).toLocaleString("ar-LY")}{r.duplicate_count>1?` • ${r.duplicate_count} بلاغات مماثلة`:""}</p></div><div className="report-buttons"><Button disabled={busy||r.status==="RESOLVED"||r.status==="EXPIRED"} onClick={()=>post(`/api/reports/${r.id}/respond`,{response:"ON_MY_WAY"})}>جاي للسيارة</Button><Button variant="outline" disabled={busy||r.status==="RESOLVED"||r.status==="EXPIRED"} onClick={()=>post(`/api/reports/${r.id}/respond`,{response:"RESOLVED"})}>تم حل الموضوع</Button><Button variant="ghost" disabled={busy||r.status==="RESOLVED"||r.status==="EXPIRED"} onClick={()=>post(`/api/reports/${r.id}/respond`,{response:"CANNOT_REACH_NOW"})}>مش قادر نوصل توا</Button></div></OwnerDisclosure>)}</div></div>
  {tab==="account"&&<><section className="owner-welcome"><p>كل شيء يخص سيارتك، قريب منك.</p><h2>{data.profile.full_name||"حسابك في دورني"}</h2><div className="owner-home-actions"><button onClick={()=>navigate("vehicles")}><CarFront/><b>{data.vehicles.length}</b><span>سياراتي</span></button><button onClick={()=>navigate("alerts")}><Bell/><b>{data.reports.filter(r=>r.status==="ACTIVE").length}</b><span>تنبيهات تحتاج رد</span></button></div></section><div className="account-grid"><article className="account-real-card"><span><CircleUserRound/></span><div><p>{data.user.email?"البريد الإلكتروني الموثّق":"رقم الهاتف الموثّق"}</p><h2 dir="ltr">{accountIdentifier}</h2><small>حالة الحساب: {data.profile.account_status}</small></div></article><article className="account-real-card"><span><CarFront/></span><div><p>ملخص الحساب</p><h2>{data.vehicles.length} سيارات • {activeCodes?.length??0} بطاقات فعّالة</h2><small>{data.reports.length} تنبيهات محفوظة في السجل</small></div></article></div><div className="owner-home-links"><button onClick={()=>navigate("settings")}><Settings/> إعدادات الحساب والإشعارات</button><button onClick={()=>navigate("guide")}><BookOpen/> كيف تستخدم دورني؟</button></div></>}
  </div>
  </section><nav className="owner-app-nav" aria-label="التنقل الرئيسي">{([{view:"account",label:"الرئيسية",Icon:Home},{view:"vehicles",label:"سياراتي",Icon:CarFront},{view:"alerts",label:"التنبيهات",Icon:Bell}] as const).map(({view,label,Icon})=>{const active=!panel&&tab===view;const count=view==="alerts"?data.reports.filter(r=>r.status==="ACTIVE").length:0;return <button key={view} aria-current={active?"page":undefined} onClick={()=>navigate(view)}><span><Icon aria-hidden="true"/>{count>0&&<i aria-label={`${count} تنبيهات تحتاج رد`}>{count>99?"99+":count}</i>}</span><small>{label}</small></button>;})}</nav></main>;
}
