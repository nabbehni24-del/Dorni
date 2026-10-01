"use client";
import {useLocale} from "@/components/locale-provider";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { requestJson, errorMessage } from "@/lib/client-api";

async function worker() {
  let timer: ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("تعذر تجهيز إشعارات الجهاز. أعد التحقق بعد عودة الاتصال.")),20000);})]);}
  finally{clearTimeout(timer);}
}
export function PushSettings() {
 const {t}=useLocale();
  const [configured,setConfigured]=useState(false),[active,setActive]=useState(false),[busy,setBusy]=useState(true),[supported,setSupported]=useState(false),[message,setMessage]=useState("");
  const [known,setKnown]=useState(false);
  const mounted=useRef(false),locked=useRef(false);
  const load=useCallback(async()=>{
    if(locked.current)return;
    locked.current=true;
    if(mounted.current){setBusy(true);setMessage('');}
    const capable="serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      try {
        if(!capable){if(mounted.current){setSupported(false);setKnown(true);}return;}
        if(mounted.current)setSupported(true);
        const c=await requestJson<{configured:boolean}>("/api/push");
        if(!mounted.current)return;
        setConfigured(c.configured);
        let enabled=false;
        if(c.configured && Notification.permission==='granted'){
          const sub=await (await worker()).pushManager.getSubscription();
          if(sub){const state=await requestJson<{active:boolean}>("/api/push",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"status",endpoint:sub.endpoint})});enabled=state.active;}
        }
        if(mounted.current){setActive(enabled);setKnown(true);}
      }catch(e){if(mounted.current){setKnown(false);setMessage(errorMessage(e));}}
      finally{locked.current=false;if(mounted.current)setBusy(false);}
  },[]);
  useEffect(()=>{
    mounted.current=true;
    const resume=()=>{if(document.visibilityState==='visible')void load();};
    // Synchronize external browser/server state; busy is explicit while that I/O runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    window.addEventListener('online',resume);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    const retry=window.setInterval(resume,60000);
    return()=>{mounted.current=false;clearInterval(retry);window.removeEventListener('online',resume);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },[load]);
  async function change(action:"subscribe"|"disable"|"test") {
    if(locked.current)return;
    locked.current=true;
    setBusy(true);setMessage("");
    try {
      // Request permission synchronously from a user click, including Safari's gesture requirement.
      if(action==="subscribe" && Notification.permission!=="granted" && await Notification.requestPermission()!=="granted") throw new Error("الإشعارات مش مسموحة. فعّلها من إعدادات الموقع أو التلفون ثم جرّب مرة أخرى.");
      const registration=await worker();
      let sub=await registration.pushManager.getSubscription();
      if(action==="subscribe"){
        const c=await requestJson<{configured:boolean;publicKey:string}>("/api/push");
        if(!c.configured||!c.publicKey)throw new Error("خدمة الإشعارات غير جاهزة حالياً.");
        const key=Uint8Array.from(atob(c.publicKey.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
        // Explicit enable only: do not reuse a provider-expired or detached endpoint.
        if(sub){const previous=await requestJson<{active:boolean}>("/api/push",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:'status',endpoint:sub.endpoint})});
          if(!previous.active){if(!await sub.unsubscribe())throw new Error('تعذر تجديد اشتراك الجهاز. أعد المحاولة.');sub=null;}}
        sub??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
      }
      if(!sub){setActive(false);throw new Error("فعّل إشعارات هذا الجهاز أولاً.");}
      const serialized=sub.toJSON();
      await requestJson("/api/push",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,endpoint:sub.endpoint,keys:action==="subscribe"?serialized.keys:undefined})});
      if(action==="disable"){
        setActive(false);await sub.unsubscribe();
        for(const notification of await registration.getNotifications())notification.close();
        setMessage("تم إيقاف إشعارات هذا الجهاز.");
      }else if(action==="subscribe"){
        const saved=await requestJson<{active:boolean}>("/api/push",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:'status',endpoint:sub.endpoint})});
        if(!saved.active)throw new Error('تعذر تأكيد حفظ الاشتراك. أعد التحقق.');
        setActive(true);setKnown(true);setMessage("تم ربط إشعارات هذا الجهاز بحسابك. اضغط اختبار للتأكد من وصولها.");}
      else setMessage("تم وضع إشعار الاختبار في طابور الإرسال. نجاح الوصول يتأكد لما تشوف إشعار الهاتف، مش بهذه الرسالة.");
    }catch(e){setMessage(errorMessage(e));setKnown(false);}finally{locked.current=false;setBusy(false);}
  }
  return <section className="push-settings" aria-label={t("إشعارات الجهاز")}><h2><Bell size={22}/> {t("إشعارات التلفون")}</h2>
    <p>{t("تنبيه على شاشة الهاتف حتى ودورني مسكّر، بعد موافقتك. إعدادات الصامت والتركيز والاتصال في تلفونك تتحكم في الصوت ووقت الظهور.")}</p>
    <strong role="status">{t(busy?'جاري التحقق...':!known?'تعذر تأكيد حالة الإشعارات':active?'إشعارات هذا الجهاز مفعّلة':'إشعارات هذا الجهاز غير مفعّلة')}</strong>
    {!known&&!busy?<button onClick={()=>void load()}>{t('إعادة التحقق')}</button>:!supported&&!busy?<p>{t("على الآيفون افتح دورني من أيقونته بعد إضافته للشاشة الرئيسية، واستعمل إصدار iOS يدعم Web Push. على أندرويد استخدم متصفحاً يدعم الإشعارات.")}</p>:!configured&&!busy?<p>{t("خدمة إشعارات الجهاز غير متاحة حالياً.")}</p>:<div className="push-actions"><button disabled={busy||!known} onClick={()=>void change(active?"disable":"subscribe")}>{active?<BellOff size={18}/>:<Bell size={18}/>} {busy?t("جاري التحقق..."):active?t("إيقاف إشعارات هذا الجهاز"):t("تفعيل إشعارات هذا الجهاز")}</button>{active&&<button disabled={busy||!known} onClick={()=>void change("test")}>{t("إرسال إشعار تجريبي")}</button>}</div>}
    {message&&<p role="alert" aria-live="assertive">{t(message)}</p>}
    <small>{t("إغلاق التطبيق لا يلغي التفعيل. تسجيل الخروج يفصل الاشتراك لحماية حسابك، ومسح بيانات الموقع أو حذف التطبيق قد يتطلب تفعيله من جديد.")}</small>
  </section>;
}
