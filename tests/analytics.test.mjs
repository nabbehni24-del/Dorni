import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../assets/analytics.js',import.meta.url),'utf8');
function setup(){const delivered=[];const window={dispatchEvent:e=>delivered.push(e.detail)};runInNewContext(source,{window,CustomEvent:class{constructor(type,args){this.type=type;this.detail=args.detail;}}});return {api:window.DorniAnalytics,delivered};}
test('analytics accepts only named events and strips personal/free-text data',()=>{
 const {api,delivered}=setup();assert.equal(api.track('unknown'),false);
 api.track('get_dorni_click',{location:'hero',email:'private@example.com',company:'Private company',url:'?secret=foo'});
 assert.equal(JSON.stringify(delivered[0]),'{"name":"get_dorni_click","properties":{"location":"hero"},"version":1}');
 api.track('faq_open',{faq_id:'email@example.com'});assert.equal(JSON.stringify(delivered[1].properties),'{}');
 assert.doesNotMatch(source,/\bfetch\s*\(|sendBeacon|XMLHttpRequest|document\.cookie|localStorage|sessionStorage/);
});
test('queue is bounded and failing adapter never breaks actions',()=>{
 const {api}=setup();api.setAdapter(()=>{throw Error('offline');});
 for(let i=0;i<120;i++)assert.equal(api.track('how_view'),true);
 assert.equal(api.snapshot().length,100);const copy=api.snapshot();copy.length=0;assert.equal(api.snapshot().length,100);
});
test('completion events are reserved but never inferred from a click or draft',()=>{
 const {api}=setup();for(const name of ['activation_start','activation_complete','company_form_submitted','card_order_complete'])assert.ok(api.events.includes(name));
 const scripts=['../assets/site.js','../assets/contact.js'].map(p=>readFileSync(new URL(p,import.meta.url),'utf8')).join('\n');
 assert.doesNotMatch(scripts,/track\(['"](?:activation_start|activation_complete|company_form_submitted|card_order_complete)/);
});
