\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000201','grant-admin@example.invalid'),('00000000-0000-4000-8000-000000000202','issuer@example.invalid'),('00000000-0000-4000-8000-000000000203','outsider@example.invalid');
insert into auth.sessions(id,user_id) select id,id from auth.users where id in ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000203');
insert into public.internal_memberships(user_id,role_code,active) values('00000000-0000-4000-8000-000000000201','SUPER_ADMIN',true);
insert into public.partner_organizations(id,name,type,status,trusted_generation,generation_limit_per_day) values('00000000-0000-4000-8000-000000000204','Synthetic grants','CORPORATE','ACTIVE',true,1000);
insert into public.partner_memberships(organization_id,user_id,role,status) values('00000000-0000-4000-8000-000000000204','00000000-0000-4000-8000-000000000202','PARTNER_ADMIN','ACTIVE');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000202"}',true);
set local role authenticated;
do $$ begin
 begin perform public.grant_organization_codes('00000000-0000-4000-8000-000000000204','STANDARD_CARD',200,'SELF GRANT','self-grant-request'); raise exception 'Self grant allowed'; exception when insufficient_privilege then null; end;
 begin perform * from public.create_code_batch('00000000-0000-4000-8000-000000000204','STANDARD_CARD','zero-balance-request','[{"serialNumber":"ZERO-1","publicToken":"ZERO-PUBLIC","credentialHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'); raise exception 'Trusted generation became credit'; exception when sqlstate '22023' then if sqlerrm<>'INSUFFICIENT_CODE_BALANCE' then raise; end if; end;
 begin insert into public.organization_code_grants(organization_id,product_type,quantity,reference,granted_by,request_key) values('00000000-0000-4000-8000-000000000204','STANDARD_CARD',200,'BYPASS',auth.uid(),'direct-bypass-request'); raise exception 'Direct grant write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000201"}',true);
set local role authenticated;
do $$ declare a uuid;b uuid;begin
 a:=public.grant_organization_codes('00000000-0000-4000-8000-000000000204','STANDARD_CARD',200,'ORDER TEST 200','grant-order-200-key');
 b:=public.grant_organization_codes('00000000-0000-4000-8000-000000000204','STANDARD_CARD',200,'ORDER TEST 200','grant-order-200-key');
 if a is distinct from b then raise exception 'Duplicate grant'; end if;
 begin perform public.grant_organization_codes('00000000-0000-4000-8000-000000000204','STANDARD_CARD',201,'ORDER TEST 200','grant-order-200-key'); raise exception 'Grant key conflict ignored'; exception when sqlstate '22023' then null; end;
end $$;
reset role;
-- Explicit credit works even when the obsolete trusted_generation flag is false.
update public.partner_organizations set trusted_generation=false where id='00000000-0000-4000-8000-000000000204';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000202"}',true);
set local role authenticated;
do $$ declare payload jsonb;a uuid;b uuid;inventory jsonb;begin
 select jsonb_agg(jsonb_build_object('serialNumber','GRANT-TEST-'||i,'publicToken','PUBLIC-GRANT-'||i,'credentialHash',md5(i::text)||md5(i::text)) order by i) into payload from generate_series(1,73) i;
 select batch_id into a from public.create_code_batch('00000000-0000-4000-8000-000000000204','STANDARD_CARD','issue-seventy-three',payload);
 select batch_id into b from public.create_code_batch('00000000-0000-4000-8000-000000000204','STANDARD_CARD','issue-seventy-three',payload);
 if a is distinct from b then raise exception 'Duplicate issuance'; end if;
 inventory:=public.organization_code_inventory('00000000-0000-4000-8000-000000000204');
 if inventory#>>'{balances,0,granted}'<>'200' or inventory#>>'{balances,0,issued}'<>'73' or inventory#>>'{balances,0,remaining}'<>'127' then raise exception 'Incorrect 200/73/127: %',inventory; end if;
 begin perform * from public.create_code_batch('00000000-0000-4000-8000-000000000204','OTHER','wrong-product-key',payload); raise exception 'Cross product credit used'; exception when sqlstate '22023' then if sqlerrm<>'INSUFFICIENT_CODE_BALANCE' then raise; end if; end;
 -- Duplicate serial failure after beginning issuance must roll back everything.
 begin perform * from public.create_code_batch('00000000-0000-4000-8000-000000000204','STANDARD_CARD','failing-duplicate-key',payload); raise exception 'Duplicate serial accepted'; exception when unique_violation then null; end;
 inventory:=public.organization_code_inventory('00000000-0000-4000-8000-000000000204');
 if inventory#>>'{balances,0,remaining}'<>'127' then raise exception 'Failed batch consumed credit'; end if;
end $$;
reset role;
do $$ begin
 if (select sum(quantity) from public.organization_code_consumptions)<>73 then raise exception 'Consumption ledger mismatch'; end if;
 if exists(select 1 from public.codes where serial_number like 'GRANT-TEST-%' and (service_policy<>'MANAGED' or first_activated_at is not null or activation_state<>'INACTIVE')) then raise exception 'Issued card activated early'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000203',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000203"}',true);
set local role authenticated;
do $$ begin
 begin perform public.organization_code_inventory('00000000-0000-4000-8000-000000000204'); raise exception 'Cross organization read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000201"}',true);
select id as grant_id from public.organization_code_grants where request_key='grant-order-200-key' \gset
set local role authenticated;
select public.revoke_organization_code_grant(:'grant_id','Synthetic cancellation');
select public.revoke_organization_code_grant(:'grant_id','Synthetic retry');
do $$ declare inventory jsonb;begin
 inventory:=public.organization_code_inventory('00000000-0000-4000-8000-000000000204');
 if inventory#>>'{balances,0,remaining}'<>'0' or inventory#>>'{balances,0,issued}'<>'73' or inventory#>>'{balances,0,revoked}'<>'127' then raise exception 'Revocation changed issued stock'; end if;
end $$;
reset role;
do $$ begin if (select count(*) from public.codes where serial_number like 'GRANT-TEST-%')<>73 then raise exception 'Issued cards removed'; end if; end $$;
rollback;
\echo 'PASS grants: explicit grant, no trusted credit, 200/73/127, retry, atomic rollback, tenant isolation, privilege checks, product scoping, revoke-unused-only'
