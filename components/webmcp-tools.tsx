"use client";
import { useEffect } from "react";

type ToolContext={registerTool:(tool:{name:string;title:string;description:string;inputSchema:object;annotations:object;execute:(input:Record<string,unknown>)=>Promise<unknown>},options:{signal:AbortSignal})=>void|Promise<void>};

export function WebMcpTools({onChanged}:{onChanged:()=>Promise<void>}){
  useEffect(()=>{
    const context=(document as Document&{modelContext?:ToolContext}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    const call=async(url:string,body:unknown)=>{const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error??"Operation failed");await onChanged();return data;};
    void Promise.resolve(context.registerTool({name:"create_vehicle",title:"إضافة سيارة",description:"Add a vehicle to the signed-in Dorni owner account.",inputSchema:{type:"object",properties:{manufacturer:{type:"string"},model:{type:"string"},color:{type:"string"},year:{type:"integer"}},required:["manufacturer","model","color"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>call("/api/vehicles",input)},{signal:lifecycle.signal}));
    void Promise.resolve(context.registerTool({name:"issue_dorni_code",title:"إصدار كود دورني",description:"Issue and activate one authoritative Dorni code for a vehicle owned by the signed-in account.",inputSchema:{type:"object",properties:{vehicleId:{type:"string"}},required:["vehicleId"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>call("/api/codes",input)},{signal:lifecycle.signal}));
    return()=>lifecycle.abort();
  },[onChanged]);
  return null;
}
