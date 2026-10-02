import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const base=new URL('../',import.meta.url);const html=readFileSync(new URL('index.html',base),'utf8');
const context={window:{}};runInNewContext(readFileSync(new URL('assets/translations.js',base),'utf8'),context);
const dictionary=context.window.DorniTranslations;
test('all Arabic static text and accessibility strings have full English and formal translations',()=>{
 const withoutControls=html.replace(/<div class="language-control[\s\S]*?<\/div>/g,'');
 const texts=[...withoutControls.matchAll(/>([^<>]+)</g)].map(m=>m[1].trim()).filter(t=>/[\u0600-\u06ff]/.test(t));
 const attrs=[...withoutControls.matchAll(/(?:alt|aria-label)="([^"]+)"/g)].map(m=>m[1]).filter(t=>/[\u0600-\u06ff]/.test(t));
 for(const key of new Set([...texts,...attrs])){assert.ok(dictionary[key],`Missing: ${key}`);assert.ok(dictionary[key].ar);assert.ok(dictionary[key].en);assert.doesNotMatch(dictionary[key].en,/[\u0600-\u06ff]/,key);}
});
test('formal Arabic is not merely the Libyan copy and language controls expose three options',()=>{
 assert.notEqual(dictionary['شن يصير بعد مسح QR؟'].ar,'شن يصير بعد مسح QR؟');
 assert.equal((html.match(/data-language-select/g)||[]).length,2);
 for(const locale of ['ar','ar-LY','en'])assert.equal((html.match(new RegExp('value="'+locale+'"','g'))||[]).length,2);
 const script=readFileSync(new URL('assets/language.js',base),'utf8');assert.match(script,/dorni\.landing\.language/);assert.match(script,/documentElement.dir/);assert.doesNotMatch(script,/fetch\(|XMLHttpRequest|sendBeacon/);
});
