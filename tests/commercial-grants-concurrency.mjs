import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const database=process.argv[2];
if(!/^dorni_commercial_phases_\d+$/.test(database??''))throw Error('Fresh synthetic phase database required');
const exe='C:/Program Files/PostgreSQL/17/bin/psql.exe';
const args=['-X','-h','127.0.0.1','-p','55439','-U','dorni_test','-d',database,'-v','ON_ERROR_STOP=1','-At'];
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function sql(input){const r=spawnSync(exe,args,{input,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();}
function run(input){return new Promise((resolve,reject)=>{const p=spawn(exe,args);let out='',error='';p.on('error',reject);p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>error+=b);p.on('close',status=>resolve({status,out,error}));p.stdin.end(input);});}
const auth=u=>`select set_config('request.jwt.claim.sub','${id(u)}',true),set_config('request.jwt.claims','{"session_id":"${id(u)}"}',true);set local role authenticated;`;
const issue=(u,key,count)=>`begin;${auth(u)}select * from public.create_code_batch('${id(304)}','STANDARD_CARD','concurrent-grant-${key}',(select jsonb_agg(jsonb_build_object('serialNumber','CONC-${key}-'||i,'publicToken','CONC-PUBLIC-${key}-'||i,'credentialHash',md5('${key}'||i)||md5('${key}'||i)) order by i) from generate_series(1,${count}) i));select pg_sleep(0.2);commit;`;
sql(`insert into auth.users(id,email) values('${id(301)}','conc-admin@example.invalid'),('${id(302)}','conc-a@example.invalid'),('${id(303)}','conc-b@example.invalid');
insert into auth.sessions(id,user_id) values('${id(301)}','${id(301)}'),('${id(302)}','${id(302)}'),('${id(303)}','${id(303)}');
insert into public.internal_memberships(user_id,role_code,active) values('${id(301)}','SUPER_ADMIN',true);
insert into public.partner_organizations(id,name,type,status,trusted_generation,generation_limit_per_day) values('${id(304)}','Concurrency stock','CORPORATE','ACTIVE',false,1000);
insert into public.partner_memberships(organization_id,user_id,role,status) values('${id(304)}','${id(302)}','PARTNER_ADMIN','ACTIVE'),('${id(304)}','${id(303)}','PARTNER_OPERATOR','ACTIVE');
begin;${auth(301)}select public.grant_organization_codes('${id(304)}','STANDARD_CARD',5,'Concurrent credit','concurrent-credit-key');commit;`);
let results=await Promise.all([run(issue(302,'a',4)),run(issue(303,'b',4))]);
assert.equal(results.filter(r=>r.status===0).length,1,JSON.stringify(results));
assert.match(results.find(r=>r.status!==0).error,/INSUFFICIENT_CODE_BALANCE/);
assert.equal(sql(`select sum(consumed) from public.organization_code_grants where organization_id='${id(304)}'`),'4');
console.log('PASS simultaneous issuers: 5 credits cannot fund two batches of 4');
// Both duplicate requests succeed, but the remaining single credit is debited once.
results=await Promise.all([run(issue(302,'retry',1)),run(issue(302,'retry',1))]);
assert.ok(results.every(r=>r.status===0),JSON.stringify(results));
assert.equal(sql(`select count(*) from public.code_batches where idempotency_key='concurrent-grant-retry'`),'1');
assert.equal(sql(`select sum(consumed) from public.organization_code_grants where organization_id='${id(304)}'`),'5');
console.log('PASS simultaneous duplicate retry: one batch, one debit');
sql(`begin;${auth(301)}select public.grant_organization_codes('${id(304)}','STANDARD_CARD',1,'Revocation race','concurrent-revoke-key');commit;`);
const grant=sql(`select id from public.organization_code_grants where request_key='concurrent-revoke-key'`);
results=await Promise.all([run(issue(303,'revoke',1)),run(`begin;${auth(301)}select public.revoke_organization_code_grant('${grant}','Concurrent revocation');commit;`)]);
assert.equal(results[1].status,0,JSON.stringify(results));
if(results[0].status!==0)assert.match(results[0].error,/INSUFFICIENT_CODE_BALANCE/);
assert.equal(sql(`select count(*) from public.organization_code_grants where organization_id='${id(304)}' and (consumed<0 or consumed>quantity)`),'0');
assert.equal(sql(`select (select sum(consumed) from public.organization_code_grants where organization_id='${id(304)}')=(select sum(c.quantity) from public.organization_code_consumptions c join public.organization_code_grants g on g.id=c.grant_id where g.organization_id='${id(304)}')`),'t');
console.log('PASS issue/revoke race: ledger consistent; existing cards retained');
