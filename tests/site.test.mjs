import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const base=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',base),'utf8');
const script=readFileSync(new URL('assets/site.js',base),'utf8');
test('all section links, tab relationships and icon references resolve',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const match of html.matchAll(/(?:href="#|aria-controls="|aria-labelledby=")([^"\s]+)"/g))assert.ok(ids.includes(match[1]),match[1]);
});
test('all local image, script and style assets exist',()=>{
 for(const match of html.matchAll(/(?:src|href)="(assets\/[^"?]+)(?:\?[^" ]*)?"/g))assert.ok(existsSync(new URL(match[1],base)),match[1]);
});
test('calls to action use existing app routes without invented contacts or activation forms',()=>{
 const allowed=['/login','/app?tab=vehicles','/app?tab=support','/app?tab=privacy','/install','/partner'];
 for(const m of html.matchAll(/href="(https:[^"]+)"/g)){const url=new URL(m[1]);if(url.hostname==='dorni.onrender.com')assert.ok(allowed.includes(url.pathname+url.search));else assert.ok(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname));}
 assert.doesNotMatch(html,/<form|mailto:|href="#"|activation-modal/);
});
test('no prices, country coverage, competitor assets or fabricated marketing metrics',()=>{
 assert.doesNotMatch(html,/qrcar|cdn\.qrcar|flagcdn|الأسعار|اختر الدولة|متوفر في الدول|EGP|USD|24\/7|100\+/i);
 assert.match(html,/ليس خدمة طوارئ/);assert.match(html,/تسجيل البلاغ ما يعنيش/);
});
test('demo is clearly labelled and cannot send reports or collect credentials',()=>{
 assert.match(html,/محاكاة تعليمية/);assert.match(html,/مش رمز قابل للمسح/);
 assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/);
 assert.match(script,/لم تُنشأ|supportResult/);assert.match(script,/aria-selected/);assert.match(script,/ArrowLeft/);assert.match(script,/Escape/);
});
