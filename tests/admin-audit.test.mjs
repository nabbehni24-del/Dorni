import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=ts.transpile(read('lib/admin-audit.ts').replace("import {z} from 'zod';",''),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
const api={};new Function('exports','z',js)(api,z);
const valid={from:'2026-09-01',to:'2026-10-01'};
test('audit filter validation rejects impossible, reversed, oversized and unsafe inputs',()=>{
 assert.ok(api.auditFiltersSchema.safeParse(valid).success);
 for(const bad of [{from:'2026-02-30'},{from:'2027-01-01'},{from:'2024-01-01'},{size:10000},{page:0},{page:1.5},{page:10001},{snapshot:'garbage'},{search:'x'.repeat(81)},{role:'SUPER_ADMIN'}])assert.equal(api.auditFiltersSchema.safeParse({...valid,...bad}).success,false);
});
test('CSV preserves Arabic, quotes, delimiters, newlines and neutralizes formulas',()=>{
 assert.equal(api.csvCell('a"b,c'),'"a""b,c"');
 for(const v of ['=1+1',' +1','-1','@SUM(A1)','\ttext','\n=cmd'])assert.ok(api.csvCell(v).startsWith('"\''));
 const csv=api.auditCsv([{id:'id',action:'REPORT_RESPONDED',actor_kind:'OWNER',entity_type:'report',entity_id:null,created_at:'2026-10-01T12:00:00Z'}]);
 assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/ردّ على بلاغ/);assert.match(csv,/2026-10-01T12:00:00.000Z/);assert.equal(csv.split('\r\n').length,2);
});
test('audit local calendar uses Libya and valid bounded defaults',()=>{
 assert.equal(api.tripoliDate(new Date('2026-09-30T22:30:00Z')),'2026-10-01');
 const d=api.auditDefaults(7);assert.ok(api.auditFiltersSchema.safeParse(d).success);assert.equal(Date.parse(d.to)-Date.parse(d.from),6*86400000);
});
test('audit export requires admin, same-origin POST and private no-store response',()=>{
 const route=read('app/api/admin/activity/route.ts');assert.match(route,/requireInternal\(\['SUPER_ADMIN'\]\)/);assert.match(route,/validPushOrigin/);assert.match(route,/p_export:exporting/);assert.match(route,/private, no-store/);assert.match(route,/EXPORT_TOO_LARGE/);
});
test('audit RPC protects live sessions, bounds exports and never returns raw metadata',()=>{
 const sql=read('supabase/sql/admin_audit_workspace.sql');assert.match(sql,/private.support_allowed\('view'\)/);assert.match(sql,/is distinct from 'SUPER_ADMIN'/);assert.match(sql,/security invoker/);assert.match(sql,/revoke all.*from public,anon/);assert.match(sql,/EXPORT_TOO_LARGE/);assert.match(sql,/created_at<=snap/);assert.match(sql,/AUDIT_LOG_EXPORTED/);assert.doesNotMatch(sql,/select \*/i);
});
test('activity has dedicated data source and mobile cards prevent intrinsic table overflow',()=>{
 assert.match(read('app/admin/activity/page.tsx'),/AdminAudit/);assert.match(read('components/admin-audit.tsx'),/AbortController/);assert.match(read('components/admin-audit.css'),/\.audit-table-wrap\{display:none;\}/);assert.match(read('components/admin-audit.css'),/label:nth-of-type\(n\+3\)/);assert.match(read('components/workspace-shell.css'),/grid-template-columns: minmax\(0, 1fr\)/);
});
