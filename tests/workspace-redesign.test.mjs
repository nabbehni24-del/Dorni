import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function harness({denied=false,exists=false,grantFailed=false,activated=false}={}){
 let handler;const calls=[];
 const caller={auth:{getUser:async()=>({data:{user:{id:'admin'}}})},rpc:async(name)=>{calls.push(name);return name==='support_staff_admin'?{data:[{id:'staff',active:true,email:'staff@example.invalid'}],error:denied?{}:null}:{data:{ok:true},error:grantFailed?{}:null};}};
 const admin={auth:{admin:{createUser:async value=>{calls.push(['createUser',value]);return exists?{error:{code:'email_exists'}}:{data:{user:{id:'staff'}}};},deleteUser:async id=>{calls.push(['deleteUser',id]);return {};},getUserById:async()=>({data:{user:{app_metadata:{staff_provisioned_by:'admin'},email_confirmed_at:activated?'date':null}}}),generateLink:async value=>{calls.push(['generateLink',value]);return {data:{properties:{hashed_token:'single-use-test-token'}}};}}},from:()=>({insert:async value=>{calls.push(['audit',value]);return {};}})};
 const createClient=(_url,key)=>key==='service'?admin:caller;
 const Deno={env:{get:key=>({SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'}[key])},serve:fn=>{handler=fn;}};
 const source=read('supabase/functions/support-staff-provision/index.ts').replace(/^import .*;\r?\n/,'');
 const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});
 new Function('createClient','Deno',js)(createClient,Deno);
 return {calls,run:(value,auth=true)=>handler(new Request('https://test.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test'}:{})},body:JSON.stringify(value)}))};
}
const input={action:'create',name:'QA Staff',email:'staff@example.invalid',permissions:['view','reply']};
test('provisioning rejects anonymous and revoked admin before privileged work',async()=>{for(const options of [{},{denied:true}]){const h=harness(options);const response=await h.run(input,Boolean(options.denied));assert.equal(response.status,options.denied?403:401);assert.ok(!h.calls.some(c=>Array.isArray(c)));}});
test('new staff creation is passwordless, unconfirmed, caller-scoped and audited',async()=>{const h=harness();const response=await h.run(input);assert.equal(response.status,200);assert.equal((await response.json()).tokenHash,'single-use-test-token');const create=h.calls.find(c=>Array.isArray(c)&&c[0]==='createUser')[1];assert.equal(create.email_confirm,false);assert.equal(create.password,undefined);assert.deepEqual(create.app_metadata,{staff_provisioned_by:'admin'});assert.ok(h.calls.includes('support_staff_provision'));assert.ok(h.calls.some(c=>c[0]==='audit'));});
test('existing accounts are never reassigned or given activation links',async()=>{const h=harness({exists:true});assert.equal((await h.run(input)).status,409);assert.ok(!h.calls.includes('support_staff_provision'));assert.ok(!h.calls.some(c=>c[0]==='generateLink'||c[0]==='deleteUser'));});
test('failed grant only cleans up the just-created account',async()=>{const h=harness({grantFailed:true});assert.equal((await h.run(input)).status,403);assert.deepEqual(h.calls.find(c=>c[0]==='deleteUser'),['deleteUser','staff']);assert.ok(!h.calls.some(c=>c[0]==='generateLink'));});
test('confirmed staff cannot receive an account takeover activation link',async()=>{const h=harness({activated:true});assert.equal((await h.run({action:'reissue',id:'staff'})).status,409);assert.ok(!h.calls.some(c=>c[0]==='generateLink'));});
test('arbitrary roles and unknown capabilities are rejected',async()=>{const h=harness();assert.equal((await h.run({...input,permissions:['SUPER_ADMIN']})).status,400);assert.ok(!h.calls.some(c=>c[0]==='createUser'));});
test('unified navigation has real routes and native mobile focus containment',()=>{const shell=read('components/workspace-shell.tsx');for(const path of ['companies','production','support','inbox','settings'])assert.ok(shell.includes(`/admin/${path}`));assert.match(shell,/<dialog/);assert.match(shell,/showModal/);assert.match(shell,/aria-current/);assert.match(read('app/partner/page.tsx'),/popstate/);});
test('invitation tokens stay in URL fragments and activation occurs only by POST',()=>{assert.match(read('app/api/admin/support-staff/create/route.ts'),/activationUrl.hash/);const activation=read('app/api/staff/activate/route.ts');assert.match(activation,/validPushOrigin/);assert.match(activation,/type:\s*"invite"/);assert.match(activation,/role.data\s*!==\s*"SUPPORT"/);assert.doesNotMatch(activation,/export async function GET/);});
