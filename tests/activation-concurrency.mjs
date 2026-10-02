import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const database=process.argv[2];if(!/^dorni_commercial_phases_\d+$/.test(database??''))throw Error('Synthetic local database required');
const exe='C:/Program Files/PostgreSQL/17/bin/psql.exe',args=['-X','-h','127.0.0.1','-p','55439','-U','dorni_test','-d',database,'-v','ON_ERROR_STOP=1','-At'];
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function sql(input){const r=spawnSync(exe,args,{input,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();}
function run(input){return new Promise((resolve,reject)=>{const p=spawn(exe,args);let out='',error='';p.on('error',reject);p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>error+=b);p.on('close',status=>resolve({status,out,error}));p.stdin.end(input);});}
sql(`insert into auth.users(id,email) values('${id(801)}','activation-race-a@example.invalid'),('${id(802)}','activation-race-b@example.invalid');insert into auth.sessions(id,user_id) values('${id(801)}','${id(801)}'),('${id(802)}','${id(802)}');
insert into public.codes(id,serial_number,public_token) values('${id(811)}','ACTIVATION-RACE-1','ACTIVATION-RACE-PUBLIC-1'),('${id(812)}','ACTIVATION-RACE-2','ACTIVATION-RACE-PUBLIC-2');
insert into public.code_claims(code_id,credential_hash) select id,md5(serial_number)||md5(serial_number) from public.codes where serial_number like 'ACTIVATION-RACE-%';`);
const version=sql(`select initial_plan_version_id from public.codes where id='${id(811)}'`);
const confirm=(user,n)=>`begin;select set_config('request.jwt.claim.sub','${id(user)}',true),set_config('request.jwt.claims','{"session_id":"${id(user)}"}',true);set local role authenticated;
select public.activation_journey('confirm','ACTIVATION-RACE-${n}',md5('ACTIVATION-RACE-${n}')||md5('ACTIVATION-RACE-${n}'),jsonb_build_object('versionId','${version}','manufacturer','Synthetic','model','Race','color','Orange'))->>'state';select pg_sleep(.1);commit;`;
let results=await Promise.all([run(confirm(801,1)),run(confirm(801,1))]);assert.ok(results.every(r=>r.status===0),JSON.stringify(results));assert.equal(results.filter(r=>r.out.includes('ACTIVATED')).length,1);assert.equal(results.filter(r=>r.out.includes('OWNED')).length,1);
assert.equal(sql(`select count(*) from public.vehicles where owner_id='${id(801)}'`),'1');
console.log('PASS concurrent activation retry: one vehicle, one activation, existing service returned');
results=await Promise.all([run(confirm(801,2)),run(confirm(802,2))]);assert.ok(results.every(r=>r.status===0),JSON.stringify(results));assert.equal(results.filter(r=>r.out.includes('ACTIVATED')).length,1);assert.equal(results.filter(r=>r.out.includes('USED')).length,1);
assert.equal(sql(`select count(*) from public.vehicles where owner_id in('${id(801)}','${id(802)}')`),'2');
console.log('PASS competing owners: one claim winner, no orphan car for loser');
