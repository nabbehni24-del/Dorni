\set ON_ERROR_STOP on
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000101','legacy@example.invalid');
insert into public.codes(id,serial_number,public_token,ownership_state,activation_state,owner_paused)
select ('00000000-0000-4000-8000-00000000010'||i)::uuid,'LEGACY-'||i,'LEGACY-PUBLIC-'||i,
 case when i=2 then 'UNCLAIMED' else 'CLAIMED' end,
 case i when 2 then 'INACTIVE' when 3 then 'ACTIVE' when 4 then 'SUSPENDED' when 5 then 'SUSPENDED' when 6 then 'REVOKED' else 'REPLACED' end,
 i=4 from generate_series(2,7) i;
insert into public.code_claims(code_id,credential_hash,claimed_by,claimed_at)
 select id,md5(id::text)||md5(id::text),case when ownership_state='CLAIMED' then '00000000-0000-4000-8000-000000000101'::uuid end,
 case when ownership_state='CLAIMED' then '2026-09-01T12:00:00Z'::timestamptz end from public.codes where serial_number like 'LEGACY-%';
create table public.test_legacy_snapshot as select id,activation_state,ownership_state,owner_paused,public_token from public.codes where serial_number like 'LEGACY-%';
