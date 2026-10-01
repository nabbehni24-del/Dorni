"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { ReportSupport } from "@/lib/support-center";
export type ReportStatus = {
  status:string; ownerResponse:string|null; reportType:string; updatedAt:string;
  createdAt:string; expiresAt:string; serverNow:string; reference:string; liveTopic:string;
  vehicle:{manufacturer:string;model:string;color:string}; support:ReportSupport;
};
export function useReportStatus(token:string) {
  const [data,setData]=useState<ReportStatus|null>(null);
  const [error,setError]=useState("");
  const [unavailable,setUnavailable]=useState(false),[offline,setOffline]=useState(false);
  const [live,setLive]=useState(false),[refreshing,setRefreshing]=useState(false),[busy,setBusy]=useState(false);
  const [checkedAt,setCheckedAt]=useState(0),[clockOffset,setClockOffset]=useState(0);
  const version=useRef(0),mounted=useRef(false),flight=useRef<AbortController|null>(null),mutating=useRef(false),missing=useRef(false);
  const accept=useCallback((result:ReportStatus)=>{
    setData(result);setUnavailable(false);missing.current=false;setError("");setCheckedAt(Date.now());
    const serverTime=Date.parse(result.serverNow);if(Number.isFinite(serverTime))setClockOffset(serverTime-Date.now());
  },[]);
  const refresh=useCallback(async(force=false)=>{
    if(!mounted.current||document.hidden||flight.current||mutating.current||(!force&&missing.current))return;
    if(!navigator.onLine){setOffline(true);return;}
    setOffline(false);setRefreshing(true);
    const current=++version.current,controller=new AbortController();flight.current=controller;
    const timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch("/api/public/status/"+token,{cache:"no-store",signal:controller.signal});
      const result=await response.json();
      if(!mounted.current||version.current!==current)return;
      if(response.status===404){missing.current=true;setUnavailable(true);setData(null);throw new Error(result.error||"رابط المتابعة غير صالح أو انتهت مدته.");}
      if(!response.ok)throw new Error(result.error||"تعذر تحديث الحالة الآن.");
      accept(result);
    }catch(e){if(mounted.current&&version.current===current)setError(e instanceof Error&&e.name!=="AbortError"?e.message:"الاتصال بطيء. سنحاول التحديث مجدداً.");}
    finally{clearTimeout(timeout);if(flight.current===controller)flight.current=null;if(mounted.current&&version.current===current)setRefreshing(false);}
  },[token,accept]);
  useEffect(()=>{
    mounted.current=true;missing.current=false;
    // Initial network synchronization, not state derived from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const resume=()=>{setOffline(!navigator.onLine);if(navigator.onLine)void refresh(true);};
    window.addEventListener("online",resume);window.addEventListener("offline",resume);document.addEventListener("visibilitychange",resume);
    // These refs are request counters/controllers, not DOM nodes: invalidate their current values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return()=>{mounted.current=false;version.current++;flight.current?.abort();flight.current=null;window.removeEventListener("online",resume);window.removeEventListener("offline",resume);document.removeEventListener("visibilitychange",resume);};
  },[refresh]);
  useEffect(()=>{const timer=setInterval(()=>void refresh(),live?15000:5000);return()=>clearInterval(timer);},[refresh,live]);
  useEffect(()=>{
    if(!data?.liveTopic||unavailable)return;
    let stopped=false,debounce:ReturnType<typeof setTimeout>|undefined;
    const update=()=>{if(debounce)return;debounce=setTimeout(()=>{debounce=undefined;if(!stopped)void refresh();},200);};
    let cleanup=()=>{};
    try{
      const supabase=createBrowserSupabase();
      // Public, opaque topic carries no data; never trust a broadcast as a report state.
      const channel=supabase.channel(data.liveTopic,{config:{private:false}})
        .on("broadcast",{event:"refresh"},update)
        .subscribe(status=>{if(stopped)return;setLive(status==="SUBSCRIBED");if(status==="SUBSCRIBED")update();});
      cleanup=()=>{void supabase.removeChannel(channel);};
    }catch{/* Polling remains available when Realtime cannot connect. */}
    return()=>{stopped=true;clearTimeout(debounce);cleanup();};
  },[data?.liveTopic,refresh,unavailable]);
  // Fetch at the server-defined eligibility boundary instead of waiting for the next poll.
  useEffect(()=>{
    if(!data)return;
    const now=Date.now()+clockOffset;
    const deadlines=[data.expiresAt,!data.support.ticket?data.support.escalationAt:null,data.support.ticket&&!data.support.canCall?data.support.callAt:null]
      .filter((x):x is string=>Boolean(x)).map(Date.parse).filter(x=>x>now);
    if(!deadlines.length)return;
    const timer=setTimeout(()=>void refresh(),Math.min(2147483647,Math.min(...deadlines)-now+100));
    return()=>clearTimeout(timer);
  },[data,clockOffset,refresh]);
  async function escalate(){
    if(mutating.current||!navigator.onLine)return;
    mutating.current=true;version.current++;flight.current?.abort();flight.current=null;setRefreshing(false);setBusy(true);setError("");
    try{
      const response=await fetch("/api/public/status/"+token,{method:"POST",signal:AbortSignal.timeout(20000)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"تعذر تأكيد طلب الدعم.");
      if(mounted.current)accept(result);
    }catch(e){if(mounted.current)setError(e instanceof Error&&e.name!=="TimeoutError"?e.message:"لم يصل تأكيد التصعيد. يمكنك المحاولة مجدداً بدون إنشاء تذكرة أخرى.");}
    finally{mutating.current=false;if(mounted.current){setBusy(false);void refresh();}}
  }
  return {data,error,unavailable,offline,live:live&&!offline,refreshing,busy,checkedAt,clockOffset,refresh,escalate};
}
