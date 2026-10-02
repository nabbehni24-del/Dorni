// Creates a fresh synthetic database ONLY on the dedicated loopback test cluster.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const bin='C:/Program Files/PostgreSQL/17/bin/';
const database=`dorni_commercial_phases_${Date.now()}`;
const connection=['-h','127.0.0.1','-p','55439','-U','dorni_test'];
function run(exe,args){const r=spawnSync(bin+exe,args,{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr+'\n'+r.stdout);return r.stdout;}
run('createdb.exe',[...connection,database]);
console.log('Synthetic test database:',database);
for(const file of [
 'tests/commercial-bootstrap.sql',
 'supabase/migrations/20260917173000_dorni_foundation.sql',
 'supabase/migrations/20260917193000_service_roleless_runtime.sql',
 'supabase/migrations/20260917233000_email_auth_profiles.sql',
 'supabase/migrations/20260918120000_real_accounts_and_partner_codes.sql',
 'supabase/migrations/20260918133000_partner_self_service_qr.sql',
 'supabase/migrations/20260918150000_durable_account_provisioning.sql',
 'tests/commercial-push-contract.sql',
 'supabase/migrations/20260926120000_institutional_foundation.sql',
 'supabase/migrations/20260926123000_institutional_fk_indexes.sql',
 'supabase/migrations/20260926170000_institutional_relational_hardening.sql',
 'supabase/migrations/20260926173000_institutional_advisor_hardening.sql',
 'supabase/migrations/20260926183000_enterprise_operations_platform.sql',
 'supabase/migrations/20260926190000_enterprise_operations_indexes.sql',
 'supabase/sql/owner_workspace.sql',
 'supabase/migrations/20261002150725_commercial_security_hardening.sql',
 'tests/commercial-claim.sql','tests/commercial-batch-phone.sql',
 'tests/commercial-pre-lifecycle.sql',
 'supabase/migrations/20261002152044_code_lifecycle.sql',
 'tests/commercial-claim.sql','tests/commercial-lifecycle.sql',
 'supabase/migrations/20261002152047_organization_code_grants.sql',
 'tests/commercial-grants.sql',
 'supabase/migrations/20261002154434_service_renewal_engine.sql',
 'tests/service-renewal.sql',
 'supabase/migrations/20261002201642_activation_journey.sql',
 'tests/activation-journey.sql',
 'supabase/migrations/20261002204941_phone_profile.sql',
 'tests/phone-profile.sql'
]){
 if(file.endsWith('_service_renewal_engine.sql')){
  // Load the real current reporting implementation, without hosted Realtime/support
  // triggers. This tests the compatibility rewrite against retry/aggregation too.
  const reporter=readFileSync('supabase/sql/reporter_reliability.sql','utf8');
  const boundary=reporter.indexOf('create or replace function public.get_public_report_status');
  if(boundary<0)throw Error('Reporter fixture boundary changed');
  const r=spawnSync(bin+'psql.exe',['-X',...connection,'-d',database,'-v','ON_ERROR_STOP=1'],{input:reporter.slice(0,boundary),encoding:'utf8'});
  if(r.status!==0)throw Error(r.stderr);
  console.log('PASS current reporter retry/aggregation implementation installed');
 }
 const output=run('psql.exe',['-X',...connection,'-d',database,'-v','ON_ERROR_STOP=1','-f',file]);
 console.log('PASS',file,output.split('\n').filter(line=>line.startsWith('PASS')).join(' '));
}
const concurrent=spawnSync(process.execPath,['tests/commercial-grants-concurrency.mjs',database],{encoding:'utf8'});
if(concurrent.status!==0)throw Error(concurrent.stderr+'\n'+concurrent.stdout);
console.log(concurrent.stdout);
const serviceConcurrent=spawnSync(process.execPath,['tests/service-concurrency.mjs',database],{encoding:'utf8'});
if(serviceConcurrent.status!==0)throw Error(serviceConcurrent.stderr+'\n'+serviceConcurrent.stdout);
console.log(serviceConcurrent.stdout);
const activationConcurrent=spawnSync(process.execPath,['tests/activation-concurrency.mjs',database],{encoding:'utf8'});
if(activationConcurrent.status!==0)throw Error(activationConcurrent.stderr+'\n'+activationConcurrent.stdout);
console.log(activationConcurrent.stdout);
console.log('No production connection was used. Database retained for inspection:',database);
