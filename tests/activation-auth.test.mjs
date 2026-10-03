import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import {z} from 'zod';
import {createServerClient} from '@supabase/ssr';
function load(path,imports={}){
 imports={'@/lib/login-error': path==='lib/login-error.ts'?{}:load('lib/login-error.ts'),...imports};
 const exports={};const js=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',js)(name=>{if(name==='server-only')return {};if(name==='node:crypto')return crypto;if(name==='zod')return {z};if(name==='@/lib/auth-callback-recovery')return load('lib/auth-callback-recovery.ts');if(name in imports)return imports[name];throw Error('Unexpected import '+name);},exports);return exports;
}

test('manual entry replaces legacy link-captured context without changing owned service contexts',async()=>{
 const before=process.env.CLAIM_PEPPER;process.env.CLAIM_PEPPER='synthetic-manual-entry-test-secret';
 try{
  const jar=new Map();const cookieStore={get:n=>jar.has(n)?{value:jar.get(n)}:undefined,set:(n,v)=>jar.set(n,v),delete:n=>jar.delete(n)};
  const context=load('lib/server/activation-context.ts',{'next/headers':{cookies:async()=>cookieStore}});
  const pending=context.newContext('SERIAL','synthetic-proof');
  const legacy={...pending};delete legacy.entry;
  await context.saveActivationContext(legacy);assert.equal(await context.readActivationContext(),null);
  await context.saveActivationContext(pending);assert.equal((await context.readActivationContext()).entry,'manual');
  await context.saveActivationContext({id:pending.id,expires:pending.expires,codeId:'owned-card',userId:'owner'});
  assert.equal((await context.readActivationContext()).codeId,'owned-card');
  await context.clearActivationContext();assert.equal(await context.readActivationContext(),null);
  await context.rememberActivationSerial('SERIAL');
  assert.equal(await context.activationDestination('/app'),'/claim');
  assert.equal(await context.readActivationContext(),null); // identity is never claim proof
  await context.clearActivationContext();assert.equal(await context.activationDestination('/app'),'/app');
 }finally{if(before===undefined)delete process.env.CLAIM_PEPPER;else process.env.CLAIM_PEPPER=before;}
});

test('activation screen never captures a credential from a scanned URL',()=>{
 const source=readFileSync(new URL('../components/activation-journey.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/(?:params|searchParams)\.get\(['"]code['"]\)/);
 assert.match(source,/action:'restart'/);
 assert.match(source,/if\(j.state==='MISSING'\)setManual\(true\)/);
 assert.match(source,/await capture\(s,c\)/); // explicit form submission only
 assert.match(source,/onClick=\{\(\)=>void startAnother\(\)\}/);
 assert.match(source,/async function startAnother\(\)/);
});

test('support-only recovery refuses before constructing an Auth client or sending mail',async()=>{
 const route=load('app/api/auth/[action]/route.ts',{
  '@/lib/supabase/server':{createServerSupabase:async()=>{throw Error('Auth must not be called');}},
  '@/lib/server/account':{},'@/lib/server/public-origin':{},'@/lib/server/activation-context':{},
  '@/lib/server/http':{json:(body,status=200)=>({body,status}),UnauthorizedError:class extends Error{}},
 });
 const result=await route.POST(new Request('https://example.invalid/api/auth/forgot-password',{method:'POST'}),{params:Promise.resolve({action:'forgot-password'})});
 assert.equal(result.status,403);assert.equal(result.body.code,'SUPPORT_RECOVERY_REQUIRED');
});

test('immediate signup creates only the account, not a card or trial, and returns to manual activation',async()=>{
 const calls=[];
 const route=load('app/api/auth/[action]/route.ts',{
  '@/lib/supabase/server':{createServerSupabase:async()=>({auth:{signUp:async()=>({data:{session:{user:{id:'synthetic'}}},error:null})},rpc:async(name)=>{calls.push(name);return {error:null};}})},
  '@/lib/server/account':{},'@/lib/server/public-origin':{publicOrigin:()=> 'https://example.invalid'},
  '@/lib/server/activation-context':{activationDestination:async()=>'/claim'},
  '@/lib/server/http':{json:(body,status=200)=>({body,status}),UnauthorizedError:class extends Error{}},
 });
 const result=await route.POST(new Request('https://example.invalid/api/auth/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fullName:'Synthetic Owner',email:'synthetic@example.invalid',password:'Synthetic-test-123'})}),{params:Promise.resolve({action:'signup'})});
 assert.equal(result.status,201);assert.equal(result.body.needsEmailConfirmation,false);
 assert.equal(result.body.destination,'/claim');assert.deepEqual(calls,['provision_my_account']);
});

test('email ownership projection never trusts client metadata or implicit confirmation',()=>{
 const migration=readFileSync(new URL('../supabase/migrations/20261003130625_staging_independent_contact_proof.sql',import.meta.url),'utf8');
 assert.match(migration,/email_ownership_proofs enable row level security/);
 assert.match(migration,/revoke all on private.email_ownership_proofs from public, anon, authenticated/);
 assert.match(migration,/p.email=lower\(u.email\)/);
 assert.match(migration,/CONTACT_PROOF_BASELINE_MISMATCH/);
 assert.match(migration,/'http_code',403/);
 assert.doesNotMatch(migration,/insert into private.email_ownership_proofs/i);
});

for (const route of ['app/auth/callback/route.ts','app/auth/recovery/route.ts']) {
 test(`${route}: preserves explicit PKCE flow binding, including invalid empty values`,async()=>{
  for(const flowId of [null,'first-flow_123','second-flow_456','']) {
   let received;
   const supabase={auth:{exchangeCodeForSession:async(...args)=>{received=args;return {error:null};}},rpc:async()=>({error:null})};
   const callback=load(route,{
    '@supabase/supabase-js':{},
    '@/lib/supabase/server':{createServerSupabase:async()=>supabase},
    '@/lib/server/public-origin':{publicOrigin:()=> 'https://example.invalid'},
    '@/lib/server/activation-context':{activationDestination:async()=>'/claim'},
    'next/headers':{cookies:async()=>({get:()=>undefined})},
    'next/server':{NextResponse:{redirect:url=>({url:String(url),cookies:{delete(){}}})}},
   });
   const url=new URL('https://example.invalid/auth/callback?code=synthetic-code&next=/claim');
   if(flowId!==null)url.searchParams.set('sb_flow_id',flowId);
   const result=await callback.GET(new Request(url));
   assert.deepEqual(received,['synthetic-code',flowId===null?undefined:{flowId}]);
   assert.equal(result.url,`https://example.invalid/${route.includes('/recovery/')?'reset-password':'claim'}`);
  }
 });
}

test('real Supabase SDK uses the original signup verifier after a second email flow',async()=>{
 const jar=new Map(),flows=[];let matched=false;
 const client=()=>createServerClient('https://synthetic.supabase.co','synthetic-publishable-key',{
  auth:{experimental:{appendPkceFlowIdToRedirects:true}},
  cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>value?jar.set(name,value):jar.delete(name))},
  global:{fetch:async(input,init)=>{
   const url=new URL(String(input));const body=JSON.parse(init.body);
   if(url.pathname.endsWith('/signup')){
    flows.push({challenge:body.code_challenge,redirect:new URL(url.searchParams.get('redirect_to'))});
    return new Response(JSON.stringify({id:crypto.randomUUID(),aud:'authenticated',email:'synthetic@example.invalid',created_at:new Date().toISOString()}),{status:200,headers:{'content-type':'application/json'}});
   }
   if(url.pathname.endsWith('/token')){
    matched=crypto.createHash('sha256').update(body.code_verifier).digest('base64url')===flows[0].challenge;
    // Stop before creating a session: only verifier selection is under test.
    return new Response(JSON.stringify({code:'flow_state_expired',msg:'Synthetic test stops at exchange'}),{status:400,headers:{'content-type':'application/json'}});
   }
   throw Error('Unexpected SDK request');
  }},
 });
 for(let i=0;i<2;i++){
  const result=await client().auth.signUp({email:'synthetic@example.invalid',password:'SyntheticOnly123',options:{emailRedirectTo:'https://example.invalid/auth/callback?next=/claim'}});
  assert.equal(result.error,null);
 }
 assert.equal(flows.length,2);
 const first=flows[0].redirect;
 assert.ok(first.searchParams.get('sb_flow_id'));
 assert.notEqual(first.searchParams.get('sb_flow_id'),flows[1].redirect.searchParams.get('sb_flow_id'));
 first.searchParams.set('code','synthetic-auth-code');
 const callback=load('app/auth/callback/route.ts',{
  '@supabase/supabase-js':{},'@/lib/supabase/server':{createServerSupabase:async()=>client()},
  '@/lib/server/public-origin':{publicOrigin:()=> 'https://example.invalid'},
  '@/lib/server/activation-context':{activationDestination:async()=>'/claim'},
  'next/headers':{cookies:async()=>({get:()=>undefined})},
  'next/server':{NextResponse:{redirect:url=>({url:String(url),cookies:{delete(){}}})}},
 });
 await callback.GET(new Request(first));
 assert.equal(matched,true,'first email must not use the second signup verifier');
});
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
