import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function draftModule(storage){const exports={};const js=ts.transpileModule(read('lib/batch-draft.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;new Function('exports','sessionStorage',js)(exports,storage);return exports;}
test('pending batch survives refresh, isolates actors and clears on success',()=>{
 const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 let draft=draftModule(storage);draft.saveBatchDraft('admin-a',{organizationId:'company-a',quantity:2});
 draft=draftModule(storage);assert.deepEqual(draft.readBatchDraft('admin-a'),{organizationId:'company-a',quantity:2});assert.equal(draft.readBatchDraft('admin-b'),null);
 draft.clearBatchDraft('admin-a');assert.equal(draft.readBatchDraft('admin-a'),null);
});
test('invalid or unavailable recovery storage fails closed',()=>{
 assert.throws(()=>draftModule({getItem:()=>'{bad'}).readBatchDraft('a'));
 for(const quantity of [0,1001,1.5,'2'])assert.throws(()=>draftModule({getItem:()=>JSON.stringify({organizationId:'',quantity})}).readBatchDraft('a'));
 assert.throws(()=>draftModule({setItem:()=>{throw Error('unavailable');}}).saveBatchDraft('a',{organizationId:'',quantity:2}));
});
test('renewal UI distinguishes failed loading from a confirmed empty result',()=>{
 const source=read('components/renewal-admin.tsx');
 assert.match(source,/loaded&&!loading&&rows.length===0/);assert.match(source,/setLoaded\(false\)/);assert.match(source,/setLoaded\(true\)/);
 assert.match(source,/disabled=\{busy\|\|loading\|\|!loaded\}/);
});
test('batch recovery clears old exports and freezes pending parameters',()=>{
 const source=read('components/admin-workspace.tsx');
 assert.match(source,/if\(kind==="batch"\)setProductionExport\(""\)/);
 assert.match(source,/saveBatchDraft\(data.actorId,batch\)/);
 assert.equal((source.match(/disabled=\{busy\|\|pendingBatch\|\|!batchReady\}/g)||[]).length,2);
 assert.match(source,/حالة توليد الأكواد/);
});
