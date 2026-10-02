\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,phone) values('00000000-0000-4000-8000-000000000011','issuer@example.invalid','218911111111');
insert into public.partner_organizations(id,name,type,status,trusted_generation,generation_limit_per_day)
values('00000000-0000-4000-8000-000000000012','Synthetic company','CORPORATE','ACTIVE',true,1);
insert into public.partner_memberships(organization_id,user_id,role,status)
values('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011','PARTNER_ADMIN','ACTIVE');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',true);
set local role authenticated;
update public.contact_methods set verified_at=now() where user_id=auth.uid();
do $$ declare a uuid; b uuid; payload jsonb:=jsonb_build_array(jsonb_build_object('serialNumber','TEST-BATCH-001','publicToken','TEST-PUBLIC-BATCH-001','credentialHash',repeat('c',64))); begin
 if exists(select 1 from public.contact_methods where user_id=auth.uid() and verified_at is not null) then raise exception 'Fake phone verification accepted'; end if;
 select batch_id into a from public.create_code_batch('00000000-0000-4000-8000-000000000012','STANDARD_CARD','test-idempotency-001',payload);
 select batch_id into b from public.create_code_batch('00000000-0000-4000-8000-000000000012','STANDARD_CARD','test-idempotency-001',payload);
 if a is null or a is distinct from b then raise exception 'Idempotent batch failed'; end if;
 begin
  perform * from public.create_code_batch('00000000-0000-4000-8000-000000000012','OTHER','test-idempotency-001',payload);
  raise exception 'Changed payload accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform * from public.create_code_batch('00000000-0000-4000-8000-000000000012','STANDARD_CARD','test-idempotency-002',payload);
  raise exception 'Daily quota bypassed';
 exception when sqlstate '22023' then null; end;
end $$;
reset role;
update auth.users set phone_confirmed_at=now() where id='00000000-0000-4000-8000-000000000011';
do $$ begin
 if not exists(select 1 from public.contact_methods where user_id='00000000-0000-4000-8000-000000000011' and verified_at is not null) then raise exception 'Genuine Auth verification not recognized'; end if;
end $$;
set local role authenticated;
update public.contact_methods set destination='+218922222222',verified_at=now() where user_id=auth.uid();
do $$ begin
 if exists(select 1 from public.contact_methods where user_id=auth.uid() and verified_at is not null) then raise exception 'Changed phone retained old proof'; end if;
end $$;
reset role;
rollback;
\echo 'PASS: phone proof authority, same-request retry at quota, payload conflict, daily quota'
