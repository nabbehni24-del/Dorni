\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','claim-test@example.invalid');
insert into public.vehicles(id,owner_id,manufacturer,model,color) values
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Test','Synthetic','Orange');
insert into public.codes(id,serial_number,public_token) values
 ('00000000-0000-4000-8000-000000000003','TEST-CLAIM-001','PUBLIC-NOT-A-CLAIM'),
 ('00000000-0000-4000-8000-000000000004','TEST-MISSING-001','PUBLIC-MISSING');
insert into public.code_claims(code_id,credential_hash) values
 ('00000000-0000-4000-8000-000000000003',repeat('a',64));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
begin
 if public.claim_dorni_code('TEST-CLAIM-001',null,'00000000-0000-4000-8000-000000000002') is not null then raise exception 'NULL proof accepted'; end if;
 if public.claim_dorni_code('TEST-MISSING-001',repeat('a',64),'00000000-0000-4000-8000-000000000002') is not null then raise exception 'Missing credential accepted'; end if;
 for i in 1..4 loop
  if public.claim_dorni_code('TEST-CLAIM-001',repeat('b',64),'00000000-0000-4000-8000-000000000002') is not null then raise exception 'Wrong proof accepted'; end if;
 end loop;
 if public.claim_dorni_code('TEST-CLAIM-001',repeat('a',64),'00000000-0000-4000-8000-000000000002') is not null then raise exception 'Lock bypassed'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.code_claims where code_id='00000000-0000-4000-8000-000000000003' and failed_attempts=5 and locked_until>now()) then raise exception 'Counter did not persist'; end if;
end $$;
update public.code_claims set locked_until=now()-interval '1 second';
set local role authenticated;
do $$ declare a uuid; b uuid; begin
 a:=public.claim_dorni_code('TEST-CLAIM-001',repeat('a',64),'00000000-0000-4000-8000-000000000002');
 b:=public.claim_dorni_code('TEST-CLAIM-001',repeat('a',64),'00000000-0000-4000-8000-000000000002');
 if a is null or a is distinct from b then raise exception 'Claim/retry failed'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.code_assignments where code_id='00000000-0000-4000-8000-000000000003')<>1 then raise exception 'Duplicate assignment'; end if;
end $$;
rollback;
\echo 'PASS: null proof, missing credential, durable attempt count, lockout, valid activation, idempotent retry'
