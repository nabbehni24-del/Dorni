"use client";
import {useLocale} from "@/components/locale-provider";
import { useCallback,useEffect,useRef,useState } from "react";
import Link from "next/link";
import { requestJson,errorMessage } from "@/lib/client-api";
import { newReportToken,readAttempt,type ReportAttempt } from "@/lib/report-attempt";
import { AlertTriangle,CarFront,ChevronLeft,CircleAlert,DoorOpen,Lightbulb,LocateFixed,MoveRight,RefreshCw,ShieldCheck } from "lucide-react";
import { DorniBrand } from "./dorni-brand";
import { Button } from "./ui/button";
import { RadioGroup,RadioGroupItem } from "./ui/radio-group";
const reasons=[{value:"BLOCKING_EXIT",label:"السيارة تعيق خروجي",icon:MoveRight},{value:"PLEASE_MOVE",label:"الرجاء تحريك السيارة",icon:CarFront},{value:"LIGHTS_ON",label:"الأنوار ما زالت شغّالة",icon:Lightbulb},{value:"DOOR_OR_WINDOW_OPEN",label:"باب أو نافذة مفتوحة",icon:DoorOpen},{value:"VEHICLE_DAMAGE",label:"هناك ضرر أو مشكلة بالسيارة",icon:AlertTriangle},{value:"URGENT_ATTENTION",label:"تنبيه عاجل",icon:CircleAlert}];
export function PublicReportClient({token}:{token:string}){
  const {t,dir}=useLocale();
  const [vehicle,setVehicle]=useState<{manufacturer:string;model:string;color:string}|null>(null);
  const [reason,setReason]=useState("BLOCKING_EXIT");
  const [location,setLocation]=useState<{latitude:number;longitude:number}|null>(null);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[previous,setPrevious]=useState("");
  const attempt=useRef<ReportAttempt|null>(null),sending=useRef(false);
  const storageKey="dorni_report_attempt:"+token;
  const load=useCallback(async()=>{
    setError("");
    try{const d=await requestJson<{vehicle:{manufacturer:string;model:string;color:string}}>("/api/public/codes/"+token);setVehicle(d.vehicle);}
    catch(e){setError(errorMessage(e));}
  },[token]);
  useEffect(()=>{
    try {
      attempt.current=readAttempt(sessionStorage.getItem(storageKey));
      if(attempt.current&&reasons.some(r=>r.value===attempt.current!.reason)) setReason(attempt.current.reason);
      const saved=sessionStorage.getItem(storageKey+":last");
      if(saved&&/^\/status\/[A-Za-z0-9_-]{43}$/.test(saved)) setPrevious(saved);
    } catch {/* In-memory retries still work without storage. */}
    void load();
  },[load,storageKey]);
  function requestLocation(){
    if(!navigator.geolocation)return setError("الموقع غير مدعوم في هذا الجهاز");
    navigator.geolocation.getCurrentPosition(p=>{setLocation({latitude:p.coords.latitude,longitude:p.coords.longitude});setError("");},()=>setError("ما قدرناش ناخذ الموقع، تقدر ترسل البلاغ بدونه"),{enableHighAccuracy:false,timeout:8000,maximumAge:60000});
  }
  async function submit(){
    if(sending.current)return;
    if(!navigator.onLine){setError("أنت غير متصل بالإنترنت. اتصل بالشبكة ثم أعد المحاولة.");return;}
    sending.current=true;setBusy(true);setError("");
    try{
      if(!attempt.current||attempt.current.reason!==reason){
        let scanner:string|null=null;
        try{scanner=localStorage.getItem("dorni_scanner_session");}catch{}
        if(!scanner||!/^[A-Za-z0-9_-]{20,200}$/.test(scanner)) scanner=newReportToken();
        try{localStorage.setItem("dorni_scanner_session",scanner);}catch{}
        attempt.current={reason,statusToken:newReportToken(),sessionToken:scanner};
        try{sessionStorage.setItem(storageKey,JSON.stringify(attempt.current));}catch{}
      }
      const response=await fetch("/api/public/reports",{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(30000),body:JSON.stringify({publicToken:token,reportType:reason,statusToken:attempt.current.statusToken,scannerSessionToken:attempt.current.sessionToken,...location})});
      const d=await response.json();
      if(!response.ok){
        if(d.code==="NEW_ATTEMPT_REQUIRED"){attempt.current=null;try{sessionStorage.removeItem(storageKey);}catch{}}
        throw new Error(d.error||"تعذر تأكيد الإرسال. أعد المحاولة بأمان.");
      }
      if(!/^\/status\/[A-Za-z0-9_-]{43}$/.test(d.statusPath))throw new Error("تم إرسال البلاغ لكن تعذر فتح المتابعة. أعد المحاولة بنفس الطلب.");
      try{sessionStorage.setItem(storageKey+":last",d.statusPath);sessionStorage.removeItem(storageKey);}catch{}
      window.location.assign(d.statusPath);
    }catch(e){
      setError(e instanceof Error&&e.name!=="TimeoutError"&&e.name!=="TypeError"?e.message:"لم يصل تأكيد الإرسال. أعد المحاولة؛ سنستكمل نفس الطلب بدون تكراره.");
    }finally{sending.current=false;setBusy(false);}
  }
  return <main className="public-shell" dir={dir}>
    <header className="public-header"><DorniBrand/><span className="secure-chip"><ShieldCheck/> {t("تواصل آمن")}</span></header>
    <section className="scan-card">
      {!vehicle&&!error?<div className="loading-inline"><RefreshCw className="spin"/> {t("جاري التحقق من الكود...")}</div>:error&&!vehicle?<div className="invalid-code"><CircleAlert/><h1>{t("تعذر عرض البطاقة")}</h1><p role="alert">{t(error)}</p><Button onClick={()=>void load()}>{t("إعادة المحاولة")}</Button></div>:<>
        {previous&&<p className="privacy-note"><Link href={previous}>{t("العودة لمتابعة بلاغك السابق")}</Link></p>}
        <div className="vehicle-summary"><div className="vehicle-icon"><CarFront/></div><div><p className="eyebrow">{t("تأكيد السيارة")}</p><h1>{vehicle!.manufacturer} {vehicle!.model}</h1><p>{vehicle!.color}</p></div><span className="verified-badge">{t("بطاقة مفعّلة")}</span></div>
        <div className="divider"/><div className="report-heading"><span className="step-number">1</span><div><h2>{t("شن تبي تقول لصاحب السيارة؟")}</h2><p>{t("اختار السبب، أرسل التنبيه، وتابع الرد من نفس الصفحة.")}</p></div></div>
        <RadioGroup aria-label={t("سبب التنبيه")} disabled={busy} value={reason} onValueChange={setReason} className="reason-grid">{reasons.map(({value,label,icon:Icon})=><label key={value} className={"reason-option "+(reason===value?"is-selected":"")}><RadioGroupItem value={value} className="sr-only"/><span className="reason-icon"><Icon/></span><span>{t(label)}</span><span className="selection-dot"/></label>)}</RadioGroup>
        <Button type="button" variant="outline" disabled={busy} onClick={requestLocation}><LocateFixed/> {location?t("تمت إضافة الموقع اختيارياً"):t("إضافة موقعي اختيارياً")}</Button>
        {error&&<p role="alert" className="form-error">{t(error)}</p>}
        <Button className="primary-action report-submit" onClick={()=>void submit()} disabled={busy}>{busy?<><RefreshCw className="spin"/>{t("جاري تأكيد البلاغ…")}</>:<>{t("إرسال التنبيه ومتابعته")}<ChevronLeft/></>}</Button>
        <p className="privacy-footer"><ShieldCheck/> {t("لا يظهر اسم أو رقم صاحب السيارة، وإضافة الموقع اختيارية.")}</p>
        <p className="privacy-footer">{t("عند وجود خطر مباشر، تواصل مع خدمات الطوارئ.")}</p>
      </>}
    </section>
  </main>;
}
