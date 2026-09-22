"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { requestJson, errorMessage } from "@/lib/client-api";

async function worker() {
  return Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("تعذر تجهيز إشعارات الجهاز. أعد فتح التطبيق وحاول مرة أخرى.")),12000))]);
}
export function PushSettings() {
  const [configured,setConfigured]=useState(false),[active,setActive]=useState(false),[busy,setBusy]=useState(true),[supported,setSupported]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>{
    let mounted=true;
    const capable="serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    async function load(){
      if(!capable){if(mounted){setSupported(false);setBusy(false);}return;}
      try {
        const c=await requestJson<{configured:boolean}>("/api/push");
        if(!mounted)return;
        setSupported(true);setConfigured(c.configured);
        if(c.configured){const sub=await (await worker()).pushManager.getSubscription();if(sub){const state=await requestJson<{active:boolean}>("/api/push",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"status",endpoint:sub.endpoint})});if(mounted)setActive(state.active&&Notification.permission==="granted");}}
      }catch(e){if(mounted)setMessage(errorMessage(e));}finally{if(mounted)setBusy(false);}
    }
    void load();return()=>{mounted=false;};
  },[]);
  async function change(action:"subscribe"|"disable"|"test") {
    if(busy)return;
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
        sub??=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
      }
      if(!sub){setActive(false);throw new Error("فعّل إشعارات هذا الجهاز أولاً.");}
      const serialized=sub.toJSON();
      await requestJson("/api/push",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,endpoint:sub.endpoint,keys:action==="subscribe"?serialized.keys:undefined})});
      if(action==="disable"){
        setActive(false);await sub.unsubscribe();
        for(const notification of await registration.getNotifications())notification.close();
        setMessage("تم إيقاف إشعارات هذا الجهاز.");
      }else if(action==="subscribe"){setActive(true);setMessage("تم ربط إشعارات هذا الجهاز بحسابك. اضغط اختبار للتأكد من وصولها.");}
      else setMessage("تم وضع إشعار الاختبار في طابور الإرسال. نجاح الوصول يتأكد لما تشوف إشعار الهاتف، مش بهذه الرسالة.");
    }catch(e){setMessage(errorMessage(e));}finally{setBusy(false);}
  }
  return <section className="push-settings" aria-label="إشعارات الجهاز"><h2><Bell size={22}/> إشعارات التلفون</h2>
    <p>تنبيه على شاشة الهاتف حتى ودورني مسكّر، بعد موافقتك. إعدادات الصامت والتركيز والاتصال في تلفونك تتحكم في الصوت ووقت الظهور.</p>
    {!supported&&!busy?<p>على الآيفون افتح دورني من أيقونته بعد إضافته للشاشة الرئيسية، واستعمل إصدار iOS يدعم Web Push. على أندرويد استخدم متصفحاً يدعم الإشعارات.</p>:!configured&&!busy?<p>خدمة إشعارات الجهاز غير متاحة حالياً.</p>:<div className="push-actions"><button disabled={busy} onClick={()=>void change(active?"disable":"subscribe")}>{active?<BellOff size={18}/>:<Bell size={18}/>} {busy?"جاري التحقق...":active?"إيقاف إشعارات هذا الجهاز":"تفعيل إشعارات هذا الجهاز"}</button>{active&&<button disabled={busy} onClick={()=>void change("test")}>إرسال إشعار تجريبي</button>}</div>}
    {message&&<p role="alert" aria-live="assertive">{message}</p>}
    <small>الاشتراك خاص بهذا الجهاز وحسابك الحالي؛ تسجيل الخروج يفصله. ما تحتاجش تخلّي التطبيق مفتوح.</small>
  </section>;
}

