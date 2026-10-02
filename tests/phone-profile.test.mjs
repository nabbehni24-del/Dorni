import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
function route({authorized=true,origin=true}={}){
 let calls=[];const exports={};class UnauthorizedError extends Error{}
 const deps={'zod':{z},'@/lib/server/http':{UnauthorizedError,json:(data,status=200)=>({data,status}),requireUser:async()=>{if(!authorized)throw new UnauthorizedError();return {supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:{phone:'+218912345678',verified:false},error:null};}}};}},'@/lib/server/push-origin':{validPushOrigin:()=>origin}};
 const js=ts.transpileModule(readFileSync(new URL('../app/api/profile/phone/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','exports',js)(n=>deps[n],exports);return {api:exports,calls};
}
const request=body=>new Request('https://example.invalid/api/profile/phone',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify(body)});
test('phone API only accepts number and concurrency snapshot, not identity or proof',async()=>{
 const {api,calls}=route();for(const extra of [{verified:true},{verified_at:'2026-10-02'},{phone_changed_at:null},{userId:'someone-else'},{age:20}])assert.equal((await api.POST(request({phone:'0912345678',expectedPhone:null,...extra}))).status,400);
 assert.equal(calls.length,0);assert.equal((await api.POST(request({phone:'0912345678',expectedPhone:null}))).status,200);
 assert.deepEqual(calls[0],{name:'phone_profile',args:{p_action:'save',p_phone:'0912345678',p_expected:null}});
 assert.equal((await api.POST(request({phone:null,expectedPhone:'+218912345678'}))).status,200);
});
test('phone API requires authenticated session and same origin',async()=>{
 assert.equal((await route({authorized:false}).api.GET()).status,401);
 assert.equal((await route({authorized:false}).api.POST(request({phone:null,expectedPhone:null}))).status,401);
 const {api,calls}=route({origin:false});assert.equal((await api.POST(request({phone:null,expectedPhone:null}))).status,403);assert.equal(calls.length,0);
});
function phoneMarkup(saved){
 let i=0;const states=[saved,saved?.phone??'',false,'',''];const exports={};
 const deps={'react':{...React,useEffect(){},useState:()=>[states[i++],()=>{}]},'react/jsx-runtime':jsx,'./locale-provider':{useLocale:()=>({t:s=>s})},'@/lib/client-api':{}};
 const js=ts.transpileModule(readFileSync(new URL('../components/phone-profile.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',js)(n=>deps[n],exports);return renderToStaticMarkup(React.createElement(exports.PhoneProfile));
}
test('saved phone UI is optional, never invents verification or an OTP action',()=>{
 const html=phoneMarkup({phone:'+218912345678',verified:false});assert.match(html,/غير موثّق/);assert.match(html,/إزالة رقم الهاتف/);assert.match(html,/type="tel"/);assert.match(html,/اختياري/);assert.doesNotMatch(html,/موثّق ✓|تحقق الآن|تاريخ الميلاد|العمر/);
});
test('verified and empty UI states follow only the authoritative snapshot',()=>{
 assert.match(phoneMarkup({phone:'+218912345678',verified:true}),/موثّق ✓/);
 const empty=phoneMarkup({phone:null,verified:false});assert.match(empty,/لم تضف رقم هاتف بعد/);assert.doesNotMatch(empty,/إزالة رقم الهاتف|موثّق ✓/);
});
