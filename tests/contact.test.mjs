import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../assets/contact.js',import.meta.url),'utf8');
function setup(name){const handlers={};const button={disabled:true};const result={hidden:true};const link={href:'',focus(){}};const events=[];const form={elements:{company:{value:name,setCustomValidity(){},reportValidity(){}},quantity:{value:'1–10'},purpose:{value:'بطاقات الموظفين'}},querySelector:()=>button,reportValidity:()=>true,addEventListener:(type,fn)=>handlers[type]=fn};runInNewContext(source,{document:{querySelector:s=>s==='#company-draft-form'?form:s==='#company-draft-result'?result:link},window:{DorniAnalytics:{track:name=>events.push(name)}}});return {handlers,button,result,link,events};}
test('company draft goes only to approved recipient and safely encodes body',()=>{
 const s=setup('شركة & Partners?\nBcc: attacker@example.com');s.handlers.submit({preventDefault(){}});
 const url=new URL(s.link.href);assert.equal(url.pathname,'dorni.2026@gmail.com');assert.equal([...url.searchParams.keys()].join(','),'subject,body');
 assert.ok(url.searchParams.get('body').includes('شركة & Partners?'));assert.equal(s.result.hidden,false);assert.deepEqual(s.events,['company_draft_prepared']);
 s.handlers.input();assert.equal(s.result.hidden,true);assert.equal(s.link.href,'mailto:dorni.2026@gmail.com');
});
test('blank company name does not create a draft',()=>{const s=setup('   ');s.handlers.submit({preventDefault(){}});assert.equal(s.result.hidden,true);assert.deepEqual(s.events,[]);});
