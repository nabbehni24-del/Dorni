import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('customer settings omit implementation commentary but retain material limitations',()=>{
 const source=read('components/owner-center.tsx');
 for(const phrase of ['لن نسجل موافقة وهمية','لن نرسل رمزاً وهمياً','لن نعرض مفتاح لغة','ليس حقلاً حراً']) assert.ok(!source.includes(phrase));
 assert.match(source,/لا يحذف أو يعطّل الحساب تلقائياً/);
 assert.match(source,/الشروط وسياسة الخصوصية غير متاحتين/);
 assert.match(source,/<PushSettings\/>/);
});
