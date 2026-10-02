import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const base=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',base),'utf8');
const script=readFileSync(new URL('assets/site.js',base),'utf8');

test('mobile navigation includes the actual login destination',()=>{
 const menu=html.match(/<nav class="mobile-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
 assert.match(menu,/<a href="https:\/\/dorni.onrender.com\/login">تسجيل الدخول<\/a>/);
});
test('all section links, tab relationships and icon references resolve',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const match of html.matchAll(/(?:href="#|aria-controls="|aria-labelledby=")([^"\s]+)"/g))assert.ok(ids.includes(match[1]),match[1]);
});
test('all local image, script and style assets exist',()=>{
 for(const match of html.matchAll(/(?:src|href)="(assets\/[^"?]+)(?:\?[^" ]*)?"/g))assert.ok(existsSync(new URL(match[1],base)),match[1]);
});
test('calls to action use existing app routes without invented contacts or activation forms',()=>{
 const allowed=['/login','/app?tab=vehicles','/app?tab=support','/app?tab=privacy','/install','/partner'];
 for(const m of html.matchAll(/href="(https:[^"]+)"/g)){const url=new URL(m[1]);if(url.hostname==='dorni.onrender.com')assert.ok(allowed.includes(url.pathname+url.search));else assert.ok(['fonts.googleapis.com','fonts.gstatic.com','dorni-landing.onrender.com'].includes(url.hostname));}
 for(const m of html.matchAll(/href="mailto:([^"?]+)/g))assert.equal(m[1],'dorni.2026@gmail.com');
 assert.doesNotMatch(html,/href="#"|activation-modal/);
 assert.match(html,/type="submit" disabled/); // No accidental GET submission without JavaScript.
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

test('original illustrations remain without tilted phone mockups or screenshots',()=>{
 assert.match(html,/assets\/person-scanner.webp/);assert.match(html,/assets\/person-notified.webp/);
 assert.match(html,/assets\/style.css/);assert.match(html,/assets\/journey.css/);
 const sections=[...html.matchAll(/<section class="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(sections,['hero','section problems','section how','section demo','section journey','section privacy','section get-dorni','section business','section faq','final-cta']);
 assert.doesNotMatch(html,/class="preview-phone"|class="screen-(?:front|back)"|src="assets\/(?:report|status|notifications)-screen/);
});

test('purchase, activation and company contact remain separate and honest',()=>{
 assert.match(html,/id="get-dorni"/);assert.match(html,/data-event="card_order_start"/);
 assert.match(html,/يفتح تطبيق البريد/);assert.match(html,/ما زالت ما انرسلتش/);
 assert.match(html,/عندي بطاقة — تفعيل/);assert.match(html,/data-event="company_email_open"/);
 assert.doesNotMatch(html,/الشاكي|data-event="(?:activation_complete|card_order_complete|company_form_submitted)"/);
 assert.equal((html.match(/class="problem-card reveal"/g)||[]).length,4);
 assert.equal((html.match(/data-faq=/g)||[]).length,12);
});

test('search and sharing metadata use the live website and existing icon',()=>{
 assert.match(html,/<html lang="ar" dir="rtl">/);
 assert.match(html,/<link rel="canonical" href="https:\/\/dorni-landing.onrender.com\/">/);
 assert.match(html,/og:image" content="https:\/\/dorni-landing.onrender.com\/assets\/dorni-share.jpg/);
 assert.ok(existsSync(new URL('assets/dorni-share.jpg',base)));
 assert.match(html,/rel="icon" type="image\/png" href="assets\/dorni-icon-current.png"/);
 assert.equal((html.match(/<h1>/g)||[]).length,1);
});
