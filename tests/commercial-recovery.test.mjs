import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as crypto from 'node:crypto';
import ts from 'typescript';
function load(path,imports={}){
 const exports={};
 const js=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',js)(name=>{if(name==='server-only')return {};if(name==='node:crypto')return crypto;if(name in imports)return imports[name];throw Error('Unexpected import '+name);},exports);
 return exports;
}
const security=load('lib/server/security.ts');
const {productionCsv}=load('lib/server/code-engine.ts',{'./security':security});
const {recoverableCodes}=load('lib/server/batch-recovery.ts',{'./security':security});

test('printed activation URL identifies the card but never carries its private code',()=>{
 const csv=productionCsv('TEST',[{serialNumber:'SERIAL-1',publicToken:'public-token',claimCode:'private-code',credentialHash:'digest'}],'https://example.invalid');
 assert.ok(csv.includes('"https://example.invalid/claim#serial=SERIAL-1"'));
 assert.ok(csv.includes('"private-code"'));
 assert.ok(csv.includes('"https://example.invalid/t/public-token"'));
 assert.equal(csv.includes('&code='),false);
 assert.equal(csv.split('private-code').length-1,1);
});
test('production code recovery is stable, scoped, secret-separated and fails closed',async()=>{
 const oldKey=process.env.BATCH_GENERATION_SECRET,oldPepper=process.env.CLAIM_PEPPER;
 try{
  process.env.BATCH_GENERATION_SECRET='synthetic-test-only-secret-32-bytes-long';
  process.env.CLAIM_PEPPER='synthetic-claim-pepper';
  const first=await recoverableCodes(3,'user-a','org-a','STANDARD_CARD','request-a');
  const retry=await recoverableCodes(3,'user-a','org-a','STANDARD_CARD','request-a');
  assert.deepEqual(first,retry);
  assert.equal(productionCsv('TEST-BATCH',first,'https://example.invalid'),productionCsv('TEST-BATCH',retry,'https://example.invalid'));
  assert.notDeepEqual(first,await recoverableCodes(3,'user-b','org-a','STANDARD_CARD','request-a'));
  assert.notDeepEqual(first,await recoverableCodes(3,'user-a','org-b','STANDARD_CARD','request-a'));
  assert.equal(new Set(first.map(x=>x.serialNumber)).size,3);
  for(const row of first){
   assert.equal(row.credentialHash,await security.claimDigest(row.serialNumber,row.claimCode));
   assert.notEqual(row.credentialHash,await security.claimDigest(row.serialNumber,row.publicToken));
  }
  delete process.env.BATCH_GENERATION_SECRET;
  await assert.rejects(recoverableCodes(1,'a',null,'STANDARD_CARD','x'),/BATCH_GENERATION_SECRET/);
 }finally{
  if(oldKey===undefined)delete process.env.BATCH_GENERATION_SECRET;else process.env.BATCH_GENERATION_SECRET=oldKey;
  if(oldPepper===undefined)delete process.env.CLAIM_PEPPER;else process.env.CLAIM_PEPPER=oldPepper;
 }
});
