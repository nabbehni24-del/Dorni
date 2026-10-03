import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

function fixture({ expires = new Date(Date.now()+60000).toISOString(), change, storageError = false, denied = false, revoke = false } = {}) {
  let row = { id: 'export', batch_id: 'batch', storage_path: 'batch/test.csv', expires_at: expires };
  const calls = []; let authorizations = 0;
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }),
      update: () => ({ eq: async () => { calls.push('updated'); return {}; } }),
    }),
    storage: { from: () => ({ download: async (path, options, parameters) => {
      calls.push({ path, options, parameters });
      if(change) row = change(row);
      return { data: new Blob(['synthetic,csv']), error: storageError ? new Error('private detail') : null };
    } }) },
  };
  const exports = {};
  const js = ts.transpileModule(readFileSync(new URL('../lib/server/export-download.ts',import.meta.url),'utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS } }).outputText;
  new Function('require','exports',js)(name => name==='node:crypto' ? { randomUUID } : { json:(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}}) },exports);
  return { calls, run: (download=true)=>exports.exportDownload(new Request('https://app.invalid/api/admin/exports/export'+(download?'?download=1':'')), 'export',async()=>{
    authorizations++; if(denied || (revoke && authorizations===2)) throw new Error('forbidden');
    return {supabase:client};
  }) };
}
test('export preparation returns only authenticated application URL, without fetching bytes',async()=>{
  const f=fixture(); const r=await f.run(false);
  assert.deepEqual(await r.json(),{url:'/api/admin/exports/export?download=1'});assert.equal(f.calls.length,0);
});
test('export CSV response disallows browser/CDN caching and preserves bytes',async()=>{
  const f=fixture();const r=await f.run();assert.equal(r.status,200);
  assert.equal(await r.text(),'synthetic,csv');assert.match(r.headers.get('cache-control'),/no-store/);
  assert.equal(r.headers.get('cdn-cache-control'),'no-store');
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.match(r.headers.get('content-disposition'),/attachment/);
  assert.equal(f.calls[0].parameters.cache,'no-store');
  await f.run();assert.notEqual(f.calls[0].options.cacheNonce,f.calls[2].options.cacheNonce);
});
for(const expires of ['invalid',null,'2000-01-01T00:00:00Z',new Date().toISOString()]){
  test('export rejects expired/invalid expiry '+expires,async()=>{
    const f=fixture({expires});assert.equal((await f.run()).status,404);assert.equal(f.calls.length,0);
  });
}
test('export fails closed when expiry changes during download',async()=>{
  const f=fixture({change:r=>({...r,expires_at:'2000-01-01T00:00:00Z'})});
  assert.equal((await f.run()).status,404);assert.equal(f.calls.length,1);
});
test('export fails closed when path changes during download',async()=>{
  const f=fixture({change:r=>({...r,storage_path:'other.csv'})});assert.equal((await f.run()).status,404);
});
test('export does not expose Storage errors or mark failed downloads',async()=>{
  const f=fixture({storageError:true});const r=await f.run();assert.equal(r.status,502);
  assert.doesNotMatch(await r.text(),/private detail/);assert.equal(f.calls.length,1);
});
test('export requires authorization even for URL preparation',async()=>{
  const f=fixture({denied:true});await assert.rejects(f.run(false));assert.equal(f.calls.length,0);
});
test('export rejects membership revocation during download',async()=>{
  const f=fixture({revoke:true});await assert.rejects(f.run());assert.equal(f.calls.length,1);
});
