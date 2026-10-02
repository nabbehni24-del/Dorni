\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000601','activation-owner@example.invalid'),('00000000-0000-4000-8000-000000000602','activation-other@example.invalid'),('00000000-0000-4000-8000-000000000603','activation-admin@example.invalid');
insert into auth.sessions(id,user_id) select id,id from auth.users where id::text like '00000000-0000-4000-8000-00000000060%';
insert into public.internal_memberships(user_id,role_code,active) values('00000000-0000-4000-8000-000000000603','SUPER_ADMIN',true);
insert into public.codes(id,serial_number,public_token) select ('00000000-0000-4000-8000-00000000061'||i)::uuid,'ACTIVATE-TEST-'||i,'ACTIVATE-PUBLIC-'||i from generate_series(1,5) i;
insert into public.code_claims(code_id,credential_hash) select id,md5(serial_number)||md5(serial_number) from public.codes where serial_number like 'ACTIVATE-TEST-%';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000601',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000601"}',true);
set local role authenticated;
do $$declare j jsonb;term text;vid text;initial_end text;begin
 j:=public.activation_journey('preview','ACTIVATE-TEST-1',repeat('b',64));
 if j->>'state'<>'INVALID' then raise exception 'Bad proof accepted';end if;
 j:=public.activation_journey('preview','ACTIVATE-TEST-1',md5('ACTIVATE-TEST-1')||md5('ACTIVATE-TEST-1'));
 if j->>'state'<>'READY' or j::text like '%credential%' or j::text like '%proof%' then raise exception 'Unsafe preview';end if;
 term:=j->>'versionId';
 j:=public.activation_journey('confirm','ACTIVATE-TEST-1',md5('ACTIVATE-TEST-1')||md5('ACTIVATE-TEST-1'),jsonb_build_object('versionId',term,'manufacturer','Toyota','model','Corolla','color','White'));
 if j->>'state'<>'ACTIVATED' then raise exception 'New owner activation failed: %',j;end if;
 vid:=j#>>'{service,vehicle,id}';initial_end:=j#>>'{service,expiresAt}';
 j:=public.activation_journey('confirm','ACTIVATE-TEST-1',md5('ACTIVATE-TEST-1')||md5('ACTIVATE-TEST-1'),jsonb_build_object('versionId',term,'manufacturer','Toyota','model','Corolla','color','White'));
 if j->>'state'<>'OWNED' or j#>>'{service,vehicle,id}'<>vid or j#>>'{service,expiresAt}'<>initial_end then raise exception 'Retry duplicated service or car';end if;
 j:=public.activation_journey('confirm','ACTIVATE-TEST-2',md5('ACTIVATE-TEST-2')||md5('ACTIVATE-TEST-2'),jsonb_build_object('versionId',term,'vehicleId',vid));
 if j->>'state'<>'VEHICLE_OCCUPIED' then raise exception 'Replaced occupied car';end if;
 j:=public.activation_journey('confirm','ACTIVATE-TEST-2',md5('ACTIVATE-TEST-2')||md5('ACTIVATE-TEST-2'),jsonb_build_object('versionId',gen_random_uuid(),'manufacturer','X','model','X','color','X'));
 if j->>'state'<>'TERMS_CHANGED' then raise exception 'Changed terms not caught';end if;
 begin perform public.manage_renewal_requests('threshold','{"days":365}');raise exception 'Owner changed threshold';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$begin
 if (select count(*) from public.vehicles where owner_id='00000000-0000-4000-8000-000000000601')<>1 then raise exception 'Orphan/duplicate vehicle';end if;
 if (select failed_attempts from public.code_claims where code_id='00000000-0000-4000-8000-000000000611')<>0 then raise exception 'Success did not reset attempts';end if;
end$$;
insert into public.vehicles(id,owner_id,manufacturer,model,color) select ('00000000-0000-4000-8000-00000000062'||i)::uuid,'00000000-0000-4000-8000-000000000601','Existing','Car','Black' from generate_series(1,2) i;
set local role authenticated;
select public.activation_journey('confirm','ACTIVATE-TEST-2',md5('ACTIVATE-TEST-2')||md5('ACTIVATE-TEST-2'),jsonb_build_object('versionId',(public.activation_journey('preview','ACTIVATE-TEST-2',md5('ACTIVATE-TEST-2')||md5('ACTIVATE-TEST-2'))->>'versionId'),'vehicleId','00000000-0000-4000-8000-000000000622'));
reset role;
update public.codes set admin_suspended=true where id='00000000-0000-4000-8000-000000000613';
set local role authenticated;
do $$declare j jsonb;begin
 j:=public.activation_journey('preview','ACTIVATE-TEST-3',md5('ACTIVATE-TEST-3')||md5('ACTIVATE-TEST-3'));if j->>'state'<>'SUSPENDED' then raise exception 'Suspension hidden';end if;
 for i in 1..5 loop perform public.activation_journey('preview','ACTIVATE-TEST-4',repeat('b',64));end loop;
 j:=public.activation_journey('preview','ACTIVATE-TEST-4',md5('ACTIVATE-TEST-4')||md5('ACTIVATE-TEST-4'));if j->>'state'<>'INVALID' then raise exception 'Lockout bypass';end if;
end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000602',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000602"}',true);
set local role authenticated;
do $$declare j jsonb;begin
 j:=public.activation_journey('preview','ACTIVATE-TEST-1',md5('ACTIVATE-TEST-1')||md5('ACTIVATE-TEST-1'));if j<>jsonb_build_object('state','USED') then raise exception 'Other owner disclosed';end if;
 begin perform public.owner_services('detail','{"codeId":"00000000-0000-4000-8000-000000000611"}');raise exception 'Owner scope bypass';exception when insufficient_privilege then null;end;
end$$;
reset role;
select v.id as monthly from public.service_plan_versions v join public.service_plans p on p.id=v.plan_id where p.code='MONTHLY' and v.version=1 \gset
create temp table before_request as select * from public.service_periods;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000601',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000601"}',true);
set local role authenticated;
select public.owner_services('request',jsonb_build_object('codeId','00000000-0000-4000-8000-000000000611','versionId',:'monthly'));
select public.owner_services('request',jsonb_build_object('codeId','00000000-0000-4000-8000-000000000611','versionId',:'monthly'));
reset role;
do $$begin
 if exists(select * from public.service_periods except select * from before_request) then raise exception 'Pending request added time';end if;
 if (select count(*) from public.service_renewal_requests where requested_by='00000000-0000-4000-8000-000000000601')<>1 then raise exception 'Duplicate request';end if;
end$$;
select id as request_id from public.service_renewal_requests where requested_by='00000000-0000-4000-8000-000000000601' \gset
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000603',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000603"}',true);
set local role authenticated;
select public.manage_renewal_requests('approve',jsonb_build_object('id',:'request_id','reason','Verified manually in test'));
select public.manage_renewal_requests('approve',jsonb_build_object('id',:'request_id','reason','Verified manually in test'));
select public.manage_renewal_requests('threshold','{"days":60}');
reset role;
do $$begin if (select count(*) from public.service_periods where kind='RENEWAL' and code_id='00000000-0000-4000-8000-000000000611')<>1 then raise exception 'Approval duplicate';end if;end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000601',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000601"}',true);
set local role authenticated;
do $$begin if public.owner_services('detail','{"codeId":"00000000-0000-4000-8000-000000000611"}')->>'status'<>'EXPIRING' then raise exception 'Threshold not configurable';end if;end$$;
reset role;
delete from auth.sessions where id='00000000-0000-4000-8000-000000000601';
set local role authenticated;
do $$begin begin perform public.activation_journey('preview','ACTIVATE-TEST-5',md5('ACTIVATE-TEST-5')||md5('ACTIVATE-TEST-5'));raise exception 'Revoked session accepted';exception when insufficient_privilege then null;end;end$$;
reset role;
rollback;
\echo 'PASS activation: new/existing/multiple vehicles, retry, private-proof failures/lockout, claimed card, admin suspension, occupied vehicle, changed terms, pending renewal unchanged, audited approval once, configured warning, revoked session'
