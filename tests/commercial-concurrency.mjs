// Explicit local-only integration run: node tests/commercial-concurrency.mjs
import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const exe='C:/Program Files/PostgreSQL/17/bin/psql.exe';
const args=['-X','-h','127.0.0.1','-p','55439','-U','dorni_test','-d','dorni_commercial_test','-v','ON_ERROR_STOP=1','-At'];
function sql(text){const r=spawnSync(exe,args,{input:text,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim();}
const user='00000000-0000-4000-8000-000000000021', org='00000000-0000-4000-8000-000000000022';
function run(text){return new Promise(resolve=>{const p=spawn(exe,args);let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('close',code=>resolve({code,stdout,stderr}));p.stdin.end(text);});}
function issue(n){return `begin; select set_config('request.jwt.claim.sub','${user}',true); set local role authenticated;
select * from public.create_code_batch('${org}','STANDARD_CARD','concurrent-local-${n}',
 jsonb_build_array(jsonb_build_object('serialNumber','CONCURRENT-LOCAL-${n}','publicToken','CONCURRENT-PUBLIC-${n}','credentialHash',repeat('${n}',64))));
select pg_sleep(0.3); commit;`;}
try{
 sql(`insert into auth.users(id,email) values('${user}','concurrency@example.invalid');
 insert into public.partner_organizations(id,name,type,status,trusted_generation,generation_limit_per_day) values('${org}','Synthetic concurrency','CORPORATE','ACTIVE',true,1);
 insert into public.partner_memberships(organization_id,user_id,role,status) values('${org}','${user}','PARTNER_ADMIN','ACTIVE');`);
 const results=await Promise.all([run(issue(1)),run(issue(2))]);
 assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
 assert.match(results.find(r=>r.code!==0).stderr,/PARTNER_DAILY_LIMIT/);
 assert.equal(sql(`select sum(generated_count) from public.code_batches where organization_id='${org}';`),'1');
 console.log('PASS: two concurrent connections cannot exceed company daily quota');
}finally{
 sql(`delete from public.audit_logs where actor_id='${user}';
 delete from public.codes where batch_id in(select id from public.code_batches where organization_id='${org}');
 delete from public.code_batches where organization_id='${org}';
 delete from public.partner_memberships where organization_id='${org}';
 delete from public.partner_organizations where id='${org}';
 delete from auth.users where id='${user}';`);
}
