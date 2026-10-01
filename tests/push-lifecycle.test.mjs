import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import sharp from 'sharp';
const source=readFileSync(new URL('../components/push-settings.tsx',import.meta.url),'utf8');
const compiled=ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX});
function harness({failed=false,active=true,subExists=true}={}) {
  const slots=[],effects=[],listeners={};let cursor=0,first=true,tree,unsubscribed=0,subscribed=0;
  const sub={endpoint:'https://push.example/old',toJSON:()=>({keys:{}}),unsubscribe:async()=>{unsubscribed++;return true;}};
  const manager={getSubscription:async()=>subExists?sub:null,subscribe:async()=>{subscribed++;return {...sub,endpoint:'https://push.example/new'};}};
  const calls=[];
  const requestJson=async(url,init)=>{calls.push(init?.body?JSON.parse(init.body):{action:'config'});if(failed)throw Error('network unavailable');
    if(!init)return {configured:true,publicKey:'YWJj'};
    const p=JSON.parse(init.body);if(p.action==='status')return {active:p.endpoint.endsWith('/new')||active};return {ok:true};};
  const react={useState:init=>{const i=cursor++;if(first)slots[i]=init;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef:init=>{const i=cursor++;if(first)slots[i]={current:init};return slots[i];},useCallback:fn=>fn,useEffect:fn=>{if(first)effects.push(fn);}};
  const events={addEventListener:(key,fn)=>{(listeners[key]??=[]).push(fn);},removeEventListener:(key,fn)=>{listeners[key]=listeners[key]?.filter(f=>f!==fn);}};
  const window={...events,PushManager:manager,Notification:{},setInterval:()=>1};
  const document={...events,visibilityState:'visible'};
  const jsx=(type,props)=>({type:typeof type==='string'?type:'icon',props});
  const exports={};
  new Function('exports','require','navigator','window','document','Notification','setTimeout','clearTimeout','clearInterval',compiled)(exports,
    name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name.includes('locale-provider')?{useLocale:()=>({t:v=>v})}:name.includes('client-api')?{requestJson,errorMessage:e=>e.message}:{Bell:()=>null,BellOff:()=>null},
    {serviceWorker:{ready:Promise.resolve({pushManager:manager,getNotifications:async()=>[]})}},window,document,{permission:'granted'},setTimeout,clearTimeout,()=>{});
  const render=()=>{cursor=0;tree=exports.PushSettings();first=false;return tree;};
  render();const cleanups=effects.map(fn=>fn());
  return {flush:async()=>{for(let i=0;i<15;i++)await Promise.resolve();render();},text:()=>JSON.stringify(tree),calls,
    setFailure:v=>{failed=v;},resume:()=>listeners.visibilitychange.forEach(fn=>fn()),close:()=>cleanups.forEach(fn=>fn?.()),
    counts:()=>({unsubscribed,subscribed}),click:async label=>{const visit=n=>{if(!n||typeof n!=='object')return; if(n.type==='button'&&JSON.stringify(n.props.children).includes(label))return n;
      for(const v of Object.values(n)){if(Array.isArray(v)){for(const x of v){const found=visit(x);if(found)return found;}}else {const found=visit(v);if(found)return found;}}};const b=visit(tree);assert.ok(b,label);b.props.onClick();}};
}
test('reopening reads durable subscription and closing never disables it',async()=>{
  for(let i=0;i<2;i++){const h=harness();await h.flush();assert.match(h.text(),/إشعارات هذا الجهاز مفعّلة/);h.close();assert.deepEqual(h.counts(),{unsubscribed:0,subscribed:0});assert.ok(h.calls.every(c=>['status','config'].includes(c.action)));}
});
test('offline initial check is unknown, not disabled; foreground retry recovers',async()=>{
  const h=harness({failed:true});await h.flush();assert.match(h.text(),/تعذر تأكيد حالة الإشعارات/);assert.doesNotMatch(h.text(),/تفعيل إشعارات هذا الجهاز/);
  h.setFailure(false);h.resume();await h.flush();assert.match(h.text(),/إشعارات هذا الجهاز مفعّلة/);h.close();
});
test('inactive provider endpoint is replaced only on explicit enable',async()=>{
  const h=harness({active:false});await h.flush();assert.deepEqual(h.counts(),{unsubscribed:0,subscribed:0});
  await h.click('تفعيل إشعارات هذا الجهاز');await h.flush();assert.deepEqual(h.counts(),{unsubscribed:1,subscribed:1});assert.match(h.text(),/إشعارات هذا الجهاز مفعّلة/);h.close();
});
test('missing browser subscription stays inactive without automatic opt-in',async()=>{
  const h=harness({subExists:false});await h.flush();assert.match(h.text(),/إشعارات هذا الجهاز غير مفعّلة/);assert.deepEqual(h.counts(),{unsubscribed:0,subscribed:0});h.close();
});
test('maskable logo fits the circular safe zone and output is opaque',async()=>{
  const {data,info}=await sharp(new URL('../public/icons/maskable-512.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,512);assert.equal(info.height,512);let whites=0;
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4;assert.equal(data[i+3],255);if(Math.min(data[i],data[i+1],data[i+2])>225){whites++;assert.ok(Math.hypot(x-255.5,y-255.5)<=204.8);}}
  assert.ok(whites>10000);
});
