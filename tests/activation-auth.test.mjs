import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import {z} from 'zod';
function load(path,imports={}){
 const exports={};const js=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',js)(name=>{if(name==='server-only')return {};if(name==='node:crypto')return crypto;if(name==='zod')return {z};if(name in imports)return imports[name];throw Error('Unexpected import '+name);},exports);return exports;
}
test('private link -> signup -> email confirmation -> same activation context, with no credential in URLs or JSON',async()=>{
 const before=process.env.CLAIM_PEPPER;process.env.CLAIM_PEPPER='synthetic-activation-test-secret-not-production';
 try{
  const jar=new Map();const cookieStore={get:n=>jar.has(n)?{value:jar.get(n)}:undefined,set:(n,v,o)=>{assert.ok(o.httpOnly);assert.equal(o.sameSite,'lax');jar.set(n,v);},delete:n=>jar.delete(n)};
  const context=load('lib/server/activation-context.ts',{'next/headers':{cookies:async()=>cookieStore}});
  const security=load('lib/server/security.ts');
  let loggedIn=false,confirmationUrl='',verified=false,rpcCalls=[];
  const supabase={auth:{signUp:async p=>{confirmationUrl=p.options.emailRedirectTo;return {data:{session:null},error:null};},verifyOtp:async()=>{loggedIn=true;verified=true;return {error:null};},exchangeCodeForSession:async()=>{loggedIn=true;verified=true;return {error:null};},signInWithPassword:async()=>{loggedIn=true;return {error:null};}},rpc:async(name,p)=>{rpcCalls.push({name,p});if(name==='activation_journey')return {data:{state:'READY',serial:'DRN-TEST-001',plan:'تجربة 15 يومًا',versionId:'00000000-0000-4000-8000-000000000001'},error:null};return {data:{},error:null};},from:()=>({select:()=>({eq:()=>({is:()=>({order:async()=>({data:[],error:null})})})})})};
  class UnauthorizedError extends Error{}
  const http={UnauthorizedError,requireUser:async()=>{if(!loggedIn)throw new UnauthorizedError();return {user:{id:'owner-new'},supabase};},json:(data,status=200)=>({data,status,cookies:{set(){},delete(){}}})};
  const shared={'@/lib/server/http':http,'@/lib/server/activation-context':context,'@/lib/server/security':security,'@/lib/supabase/server':{createServerSupabase:async()=>supabase},'@/lib/server/account':{getAccountContext:async()=>({destination:'/app',memberships:[]})},'@/lib/server/public-origin':{publicOrigin:()=> 'https://example.invalid'},'@/lib/server/push-origin':{validPushOrigin:()=>true}};
  const api=load('app/api/activation/route.ts',shared),auth=load('app/api/auth/[action]/route.ts',shared);
  const req=data=>new Request('https://example.invalid/api/activation',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify(data)});
  const captured=await api.POST(req({action:'capture',serial:'DRN-TEST-001',code:'PRIVATE-TEST-SECRET'}));
  assert.equal(captured.status,200);assert.deepEqual(captured.data,{ok:true});assert.ok(!jar.get(context.activationCookie).includes('PRIVATE'));
  const cookie=jar.get(context.activationCookie);assert.equal((await api.GET()).status,401);
  const registered=await auth.POST(req({fullName:'New Owner',email:'synthetic@example.invalid',password:'TestOnly123',portal:'owner'}),{params:Promise.resolve({action:'signup'})});
  assert.equal(registered.data.needsEmailConfirmation,true);assert.equal(registered.data.destination,'/claim');
  assert.equal(new URL(confirmationUrl).searchParams.get('next'),'/claim');assert.doesNotMatch(confirmationUrl,/PRIVATE|serial|proof/);
  const callback=load('app/auth/callback/route.ts',{...shared,'next/headers':{cookies:async()=>cookieStore},'next/server':{NextResponse:{redirect:url=>({url:String(url),cookies:{delete(){}}})}},'@supabase/supabase-js':{}});
  const returned=await callback.GET(new Request(confirmationUrl+'&type=signup&token_hash=synthetic-email-token'));
  assert.ok(verified);assert.equal(returned.url,'https://example.invalid/claim');
  assert.equal(jar.get(context.activationCookie),cookie); // Auth does not overwrite activation.
  const preview=await api.GET();assert.equal(preview.data.state,'READY');assert.equal(preview.data.serial,'DRN-TEST-001');assert.doesNotMatch(JSON.stringify(preview.data),/PRIVATE|proof|credential/);
  assert.equal(context.openContext(jar.get(context.activationCookie)).userId,'owner-new');
  assert.ok(rpcCalls.some(x=>x.name==='provision_my_account'));
  loggedIn=false;assert.equal((await api.GET()).status,401);assert.ok(context.openContext(jar.get(context.activationCookie)));
  const relogin=await auth.POST(req({email:'synthetic@example.invalid',password:'TestOnly123',portal:'owner'}),{params:Promise.resolve({action:'login'})});assert.equal(relogin.data.destination,'/claim');
  const altered=Buffer.from(jar.get(context.activationCookie),'base64url');altered[15]^=1;assert.equal(context.openContext(altered.toString('base64url')),null);
  assert.equal(context.openContext(context.sealContext({...context.newContext('S','P'),expires:Date.now()-1})),null);
  jar.clear();const otherBrowser=await callback.GET(new Request(confirmationUrl+'&type=signup&token_hash=another-synthetic-token'));assert.equal(otherBrowser.url,'https://example.invalid/claim');assert.equal((await api.GET()).status,410);
 }finally{if(before===undefined)delete process.env.CLAIM_PEPPER;else process.env.CLAIM_PEPPER=before;}
});
test('confirmation never trusts a different tab context or changed account',async()=>{
 const c={id:'00000000-0000-4000-8000-000000000001',userId:'a',serial:'S',proof:'P',expires:Date.now()+10000};let user='b',calls=0;
 const api=load('app/api/activation/route.ts',{'@/lib/server/http':{json:(data,status)=>({data,status}),requireUser:async()=>({user:{id:user},supabase:{rpc:async()=>{calls++;}}}),UnauthorizedError:class extends Error{}},'@/lib/server/security':{},'@/lib/server/activation-context':{readActivationContext:async()=>c,saveActivationContext:async()=>{}},'@/lib/server/push-origin':{validPushOrigin:()=>true}});
 assert.equal((await api.GET()).data.state,'ACCOUNT_CHANGED');user='a';
 const r=await api.POST(new Request('https://example.invalid/api/activation',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify({action:'confirm',journeyId:'00000000-0000-4000-8000-000000000002',versionId:null,vehicleId:'00000000-0000-4000-8000-000000000003'})}));
 assert.equal(r.data.state,'CONTEXT_CHANGED');assert.equal(calls,0);
});
