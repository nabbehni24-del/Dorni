import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {moduleUrl} from './load-ts.mjs';
const {LocaleProvider}=await import(moduleUrl('components/locale-provider.tsx'));
const {OwnerHome}=await import(moduleUrl('components/owner-home.tsx'));
const {LanguageSettings}=await import(moduleUrl('components/language-settings.tsx'));
const {translateOwner,ownerMessages}=await import(moduleUrl('lib/owner-messages.ts'));
const render=(locale,child)=>renderToStaticMarkup(createElement(LocaleProvider,{initialLocale:locale},child));
test('English home renders translated copy and LTR without changing vehicle data',()=>{
 const html=render('en',createElement(OwnerHome,{vehicles:[{id:'a',manufacturer:'سيارتي الخاصة',model:'Model',color:'أزرق',code_assignments:[]}],reports:[],labels:{},onCars(){},onAlerts(){}}));
 assert.match(html,/dir="ltr"/);assert.match(html,/No pending alerts/);assert.match(html,/Activate a card/);assert.match(html,/سيارتي الخاصة/);assert.doesNotMatch(html,/ما عندكش/);
});
test('formal Arabic and Libyan are distinct and right-to-left',()=>{
 const props={vehicles:[],reports:[],labels:{},onCars(){},onAlerts(){}};
 assert.match(render('ar',createElement(OwnerHome,props)),/لا توجد تنبيهات معلّقة/);
 assert.match(render('ar-LY',createElement(OwnerHome,props)),/ما عندكش تنبيهات معلّقة/);
 assert.match(render('ar',createElement(OwnerHome,props)),/dir="rtl"/);
});
test('language selector has three real choices and exactly one selected option',()=>{
 const html=render('en',createElement(LanguageSettings));
 assert.equal((html.match(/type="radio"/g)||[]).length,3);assert.equal((html.match(/checked=""/g)||[]).length,1);assert.match(html,/value="en"/);assert.match(html,/العربية \(بالليبي\)/);
});
test('all message entries have English and Arabic variants and interpolate counts',()=>{
 for(const [key,value]of Object.entries(ownerMessages)){assert.ok(value.en,key);assert.ok(value.ar,key);assert.ok(value.ly,key);}
 assert.equal(translateOwner('en','تنبيهات تحتاج ردّك: {count}',{count:2}),'Alerts awaiting your reply: 2');
 assert.equal(translateOwner('ar','No pending alerts'),'لا توجد تنبيهات معلّقة');
});
test('language persistence is isolated from notification subscriptions and account data',()=>{
 const source=readFileSync(new URL('../components/locale-provider.tsx',import.meta.url),'utf8');
 assert.match(source,/localStorage.setItem\(storageKey,value\)/);assert.match(source,/addEventListener\('storage'/);assert.match(source,/document.documentElement.dir/);
 assert.doesNotMatch(source,/fetch\(|pushManager|signOut|location.reload/);
});
