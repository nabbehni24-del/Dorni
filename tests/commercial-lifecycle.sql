\set ON_ERROR_STOP on
begin;
do $$ begin
 if exists(select 1 from public.test_legacy_snapshot s join public.codes c using(id) where (s.activation_state,s.ownership_state,s.owner_paused,s.public_token) is distinct from (c.activation_state,c.ownership_state,c.owner_paused,c.public_token) or c.service_policy<>'LEGACY') then raise exception 'Legacy behavior changed'; end if;
 if exists(select 1 from public.codes where serial_number like 'LEGACY-%' and ownership_state='CLAIMED' and first_activated_at is distinct from '2026-09-01T12:00:00Z'::timestamptz) then raise exception 'Historical activation changed'; end if;
 if not exists(select 1 from public.codes where serial_number='LEGACY-5' and admin_suspended) then raise exception 'Admin hold not preserved'; end if;
end $$;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000111','lifecycle-admin@example.invalid');
insert into auth.sessions(id,user_id) values('00000000-0000-4000-8000-000000000112','00000000-0000-4000-8000-000000000111');
insert into public.internal_memberships(user_id,role_code,active) values('00000000-0000-4000-8000-000000000111','SUPER_ADMIN',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000111',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000112"}',true);
set local role authenticated;
select public.manage_code_lifecycle('00000000-0000-4000-8000-000000000103','SUSPEND','Synthetic admin hold');
reset role;
-- Legacy owner resume request must not clear the administrative hold.
update public.codes set activation_state='ACTIVE',owner_paused=false where serial_number='LEGACY-3';
do $$ begin if not exists(select 1 from public.codes where serial_number='LEGACY-3' and admin_suspended and activation_state='SUSPENDED') then raise exception 'Admin precedence bypassed'; end if; end $$;
update public.codes set owner_paused=true where serial_number='LEGACY-3';
set local role authenticated;
select public.manage_code_lifecycle('00000000-0000-4000-8000-000000000103','RESUME','Synthetic resume');
reset role;
do $$ begin if not exists(select 1 from public.codes where serial_number='LEGACY-3' and not admin_suspended and owner_paused and activation_state='SUSPENDED') then raise exception 'Owner hold cleared by admin resume'; end if; end $$;
update public.codes set activation_state='ACTIVE',owner_paused=false where serial_number='LEGACY-3';
do $$ begin
 if not exists(select 1 from public.codes where serial_number='LEGACY-3' and activation_state='ACTIVE') then raise exception 'Resume failed'; end if;
 begin update public.codes set activation_state='ACTIVE' where serial_number='LEGACY-6'; raise exception 'Terminal resurrection accepted'; exception when raise_exception then if sqlerrm<>'TERMINAL_CARD' then raise; end if; end;
end $$;
set local role authenticated;
select public.code_lifecycle('00000000-0000-4000-8000-000000000103');
reset role;
insert into public.vehicles(id,owner_id,manufacturer,model,color) values('00000000-0000-4000-8000-000000000113','00000000-0000-4000-8000-000000000111','Synthetic','Lifecycle','Orange');
insert into public.codes(id,serial_number,public_token) values('00000000-0000-4000-8000-000000000114','NEW-LIFECYCLE','NEW-LIFECYCLE-PUBLIC-TOKEN');
insert into public.code_claims(code_id,credential_hash) values('00000000-0000-4000-8000-000000000114',repeat('d',64));
set local role authenticated;
select public.claim_dorni_code('NEW-LIFECYCLE',repeat('d',64),'00000000-0000-4000-8000-000000000113');
select public.owner_workspace('card_suspend','{"id":"00000000-0000-4000-8000-000000000114"}');
select public.manage_code_lifecycle('00000000-0000-4000-8000-000000000114','SUSPEND','Synthetic mixed hold');
select public.owner_workspace('card_resume','{"id":"00000000-0000-4000-8000-000000000114"}');
reset role;
do $$ begin
 if not exists(select 1 from public.codes c join public.code_claims cl on cl.code_id=c.id where c.id='00000000-0000-4000-8000-000000000114' and c.first_activated_at=cl.claimed_at and c.first_activated_at is not null and c.admin_suspended and not c.owner_paused and c.service_state='ENABLED' and c.activation_state='SUSPENDED' and c.service_policy='MANAGED') then raise exception 'Real owner workflow bypassed lifecycle'; end if;
end $$;
delete from auth.sessions where id='00000000-0000-4000-8000-000000000112';
set local role authenticated;
do $$ begin
 begin perform public.manage_code_lifecycle('00000000-0000-4000-8000-000000000103','SUSPEND','Revoked session'); raise exception 'Revoked session accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
\echo 'PASS lifecycle: grandfathering, first activation, independent holds, legacy compatibility, terminal state, revoked session'
