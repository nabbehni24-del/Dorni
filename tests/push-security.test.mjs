import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/sql/dorni_web_push.sql',import.meta.url),'utf8');
const worker=readFileSync(new URL('../supabase/functions/dorni-push/index.ts',import.meta.url),'utf8');
test('push bindings require a live authenticated session and logout disables that session',()=>{
 assert.match(sql,/auth\.uid\(\)/);assert.match(sql,/auth\.sessions where id=s and user_id=u/);
 assert.match(sql,/p_action='logout'[\s\S]*set enabled=false[\s\S]*session_id=s/);
 assert.match(sql,/s\.user_id=j\.recipient_id and s\.session_id=j\.session_id/);
});
test('push delivery has bounded attempts, expiring leases, atomic claims and stale-worker fencing',()=>{
 assert.match(sql,/for update skip locked/);assert.match(sql,/attempts<5/);
 assert.match(sql,/lease_token=p_lease and state='SENDING'/);assert.match(sql,/interval '2 minutes'/);
 assert.match(sql,/p_status in \(404,410\)/);assert.match(sql,/p_status=429 or p_status>=500/);
});
test('push secrets and device endpoints are private and worker RPCs are service-only',()=>{
 for(const table of ['push_settings','push_subscriptions','push_jobs']) assert.ok(sql.includes(`alter table private.${table} enable row level security`));
 assert.match(sql,/vault\.decrypted_secrets/);
 assert.match(sql,/revoke all on function public\.push_worker_config\(\),public\.claim_push_jobs\(integer\),public\.finish_push_job\(uuid,uuid,integer\) from public,anon,authenticated/);
 assert.match(worker,/sameSecret\(bearer\.slice\(7\),config\.worker_token\)/);
});
test('push worker only sends to approved HTTPS push services, never logs payloads',()=>{
 assert.match(worker,/u\.protocol === "https:"/);assert.match(worker,/!u\.username && !u\.password && !u\.port/);
 assert.match(worker,/fcm\.googleapis\.com/);assert.match(worker,/timeout:10000/);
 assert.doesNotMatch(worker,/console\.(?:log|error)\(e\)/);
});
