\set ON_ERROR_STOP on
begin;
do $$ begin
 if private.service_end('2025-01-31 10:00Z','MONTHS',1,31)<>'2025-02-28 10:00Z'::timestamptz then raise exception 'Jan31 non leap';end if;
 if private.service_end('2024-01-31 10:00Z','MONTHS',1,31)<>'2024-02-29 10:00Z'::timestamptz then raise exception 'Jan31 leap';end if;
 if private.service_end('2025-02-28 10:00Z','MONTHS',1,31)<>'2025-03-31 10:00Z'::timestamptz then raise exception 'Repeated monthly anchor drift';end if;
 if private.service_end('2025-02-28 10:00Z','MONTHS',1,30)<>'2025-03-30 10:00Z'::timestamptz then raise exception 'Day30 anchor drift';end if;
 if private.service_end('2024-02-29 10:00Z','MONTHS',12,29)<>'2025-02-28 10:00Z'::timestamptz then raise exception 'Leap annual';end if;
 if private.service_end('2027-02-28 10:00Z','MONTHS',12,29)<>'2028-02-29 10:00Z'::timestamptz then raise exception 'Leap restoration';end if;
 if private.service_end('2025-08-31 10:00Z','MONTHS',6,31)<>'2026-02-28 10:00Z'::timestamptz then raise exception 'Six months';end if;
 if private.service_end('2024-02-20 10:00Z','DAYS',15,20)<>'2024-03-06 10:00Z'::timestamptz then raise exception 'Trial days';end if;
 if exists(select 1 from public.codes where service_policy='LEGACY' and initial_plan_version_id is not null) then raise exception 'Legacy auto plan';end if;
end$$;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000401','service-admin@example.invalid'),('00000000-0000-4000-8000-000000000402','service-owner@example.invalid');
insert into auth.sessions(id,user_id) values('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000401'),('00000000-0000-4000-8000-000000000402','00000000-0000-4000-8000-000000000402');
insert into public.internal_memberships(user_id,role_code,active) values('00000000-0000-4000-8000-000000000401','SUPER_ADMIN',true);
insert into public.vehicles(id,owner_id,manufacturer,model,color) select ('00000000-0000-4000-8000-00000000040'||i)::uuid,'00000000-0000-4000-8000-000000000402','Synthetic','Service','Orange' from generate_series(3,5) i;
insert into public.codes(id,serial_number,public_token) select ('00000000-0000-4000-8000-00000000041'||i)::uuid,'SERVICE-TEST-'||i,'SERVICE-PUBLIC-TOKEN-TEST-'||i from generate_series(1,4) i;
insert into public.code_claims(code_id,credential_hash) select id,md5(id::text)||md5(id::text) from public.codes where serial_number like 'SERVICE-TEST-%';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000402',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000402"}',true);
select credential_hash as proof from public.code_claims where code_id='00000000-0000-4000-8000-000000000411' \gset
set local role authenticated;
select public.claim_dorni_code('SERVICE-TEST-1',:'proof','00000000-0000-4000-8000-000000000403');
select public.claim_dorni_code('SERVICE-TEST-1',:'proof','00000000-0000-4000-8000-000000000403');
do $$begin
 begin perform public.manage_service_catalog('version','{"code":"ILLEGAL","name":"forged","unit":"DAYS","value":999}');raise exception 'Owner changed plan';exception when insufficient_privilege then null;end;
 begin perform public.confirm_provider_service_order(gen_random_uuid(),'fake','fake',0,'LYD');raise exception 'Owner provider bypass';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$begin
 if (select count(*) from public.service_periods where code_id='00000000-0000-4000-8000-000000000411')<>1 then raise exception 'Claim duplicated trial';end if;
 if not exists(select 1 from public.service_periods where code_id='00000000-0000-4000-8000-000000000411' and ends_at-starts_at=interval '15 days') then raise exception 'Initial trial not configured 15 days';end if;
end$$;
-- Synthetic past activation, not a mutable clock or editable historical period.
update public.code_claims set claimed_by='00000000-0000-4000-8000-000000000402',claimed_at='2024-01-31 10:00Z' where code_id='00000000-0000-4000-8000-000000000412';
update public.codes set ownership_state='CLAIMED',activation_state='ACTIVE' where id='00000000-0000-4000-8000-000000000412';
insert into public.code_assignments(code_id,vehicle_id,assigned_by) values('00000000-0000-4000-8000-000000000412','00000000-0000-4000-8000-000000000404','00000000-0000-4000-8000-000000000402');
do $$begin
 if private.code_service_available('00000000-0000-4000-8000-000000000412') then raise exception 'Expired eligibility';end if;
 if exists(select 1 from public.get_public_code('SERVICE-PUBLIC-TOKEN-TEST-2')) then raise exception 'Expired vehicle disclosed';end if;
 begin perform * from public.submit_public_report('SERVICE-PUBLIC-TOKEN-TEST-2','PLEASE_MOVE',repeat('a',64),repeat('b',64));raise exception 'Expired report accepted';exception when no_data_found then if sqlerrm<>'CODE_NOT_ACTIVE' then raise;end if;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000401',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000401"}',true);
select v.id as monthly from public.service_plan_versions v join public.service_plans p on p.id=v.plan_id where p.code='MONTHLY' and version=1 \gset
set local role authenticated;
select public.create_service_order('00000000-0000-4000-8000-000000000411',:'monthly',null,'MANUAL_ADMIN','ADMIN','RENEWAL','early-renewal-key','Manual approved test') as early_order \gset
select public.create_service_order('00000000-0000-4000-8000-000000000412',:'monthly',null,'MANUAL_ADMIN','ADMIN','RENEWAL','late-renewal-key-1','Manual expired test') as late_order \gset
select public.manage_code_lifecycle('00000000-0000-4000-8000-000000000411','SUSPEND','Renew while suspended');
select public.confirm_manual_service_order(:'early_order');
select public.confirm_manual_service_order(:'early_order');
select public.confirm_manual_service_order(:'late_order');
reset role;
do $$declare sid uuid;begin
 select id into sid from public.endpoint_services where current_code_id='00000000-0000-4000-8000-000000000411';
 if (select count(*) from public.service_periods where service_id=sid)<>2 then raise exception 'Double renewal';end if;
 if not exists(select 1 from public.service_periods a join public.service_periods b on a.service_id=b.service_id where a.kind='ACTIVATION' and b.kind='RENEWAL' and a.ends_at=b.starts_at and a.service_id=sid) then raise exception 'Early start wrong';end if;
 if not exists(select 1 from public.service_periods where code_id='00000000-0000-4000-8000-000000000412' and kind='RENEWAL' and starts_at=confirmed_at) then raise exception 'Late start not confirmation';end if;
 if private.code_service_available('00000000-0000-4000-8000-000000000411') or not exists(select 1 from public.codes where id='00000000-0000-4000-8000-000000000411' and admin_suspended) then raise exception 'Renewal lifted hold';end if;
 begin update public.service_periods set ends_at=ends_at+interval '1 day' where service_id=sid;raise exception 'History editable';exception when raise_exception then if sqlerrm<>'SERVICE_HISTORY_IMMUTABLE' then raise;end if;end;
end$$;
-- Version change is append-only, and default affects only newly issued stock.
set local role authenticated;
select public.manage_service_catalog('version','{"code":"TRIAL_15_DAYS","name":"Configurable trial","unit":"DAYS","value":18}') as version_result \gset
select public.manage_service_catalog('price',jsonb_build_object('versionId',:'monthly','amountMinor',1000,'currency','LYD')) as price_result \gset
select public.manage_service_catalog('price',jsonb_build_object('versionId',:'monthly','amountMinor',2000,'currency','LYD'));
select public.create_service_order('00000000-0000-4000-8000-000000000412',:'monthly',(:'price_result'::jsonb->>'id')::uuid,'PAYMENT_PROVIDER','TEST_PROVIDER','RENEWAL','payment-order-key-1','Approved provider order') as payment_order \gset
reset role;
set local role service_role;
select public.confirm_provider_service_order(:'payment_order','TEST_PROVIDER','transaction-001',1000,'LYD');
select public.confirm_provider_service_order(:'payment_order','TEST_PROVIDER','transaction-001',1000,'LYD');
reset role;
-- Real same-owner move leaves all service periods unchanged.
-- After renewal the same public QR works, including reporter retry/aggregation.
select * from public.submit_public_report('SERVICE-PUBLIC-TOKEN-TEST-2','PLEASE_MOVE',repeat('a',64),repeat('b',64));
select * from public.submit_public_report('SERVICE-PUBLIC-TOKEN-TEST-2','PLEASE_MOVE',repeat('a',64),repeat('b',64));
select * from public.submit_public_report('SERVICE-PUBLIC-TOKEN-TEST-2','PLEASE_MOVE',repeat('c',64),repeat('d',64));
do $$begin
 if (select count(*) from public.reports where code_id='00000000-0000-4000-8000-000000000412')<>1 then raise exception 'Report retry duplicated';end if;
end$$;
-- Catalog edits never rewrite existing pinned stock; new stock uses new default.
set local role authenticated;
select public.manage_service_catalog('default',jsonb_build_object('versionId',(:'version_result'::jsonb->>'id')));
reset role;
insert into public.codes(id,serial_number,public_token) values('00000000-0000-4000-8000-000000000415','SERVICE-TEST-NEW-DEFAULT','SERVICE-PUBLIC-NEW-DEFAULT');
do $$begin
 if (select v.duration_value from public.codes c join public.service_plan_versions v on v.id=c.initial_plan_version_id where c.id='00000000-0000-4000-8000-000000000415')<>18 then raise exception 'New default not used';end if;
 if (select v.duration_value from public.codes c join public.service_plan_versions v on v.id=c.initial_plan_version_id where c.id='00000000-0000-4000-8000-000000000414')<>15 then raise exception 'Existing stock changed';end if;
 begin perform public.replace_service_card('00000000-0000-4000-8000-000000000411','00000000-0000-4000-8000-000000000102','legacy-target-test','Reject unlimited upgrade');raise exception 'Finite service transferred to legacy stock';exception when raise_exception then if sqlerrm<>'MANAGED_REPLACEMENT_REQUIRED' then raise;end if;end;
end$$;
create temp table saved_periods as select * from public.service_periods;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000402',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000402"}',true);
set local role authenticated;
select public.owner_workspace('card_move','{"id":"00000000-0000-4000-8000-000000000411","vehicleId":"00000000-0000-4000-8000-000000000405"}');
select public.owner_workspace('card_suspend','{"id":"00000000-0000-4000-8000-000000000412"}');
select public.owner_workspace('card_resume','{"id":"00000000-0000-4000-8000-000000000412"}');
reset role;
do $$begin if exists(select * from public.service_periods except select * from saved_periods) then raise exception 'Move or pause altered duration';end if;end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000401',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000401"}',true);
set local role authenticated;
select public.replace_service_card('00000000-0000-4000-8000-000000000411','00000000-0000-4000-8000-000000000413','replacement-request-1','Damaged card test');
select public.replace_service_card('00000000-0000-4000-8000-000000000411','00000000-0000-4000-8000-000000000413','replacement-request-1','Damaged card test');
reset role;
do $$begin
 if exists(select * from public.service_periods except select * from saved_periods) then raise exception 'Replacement granted time';end if;
 if private.code_service_available('00000000-0000-4000-8000-000000000411') then raise exception 'Old endpoint still enabled';end if;
 if not exists(select 1 from public.codes where id='00000000-0000-4000-8000-000000000413' and admin_suspended) then raise exception 'Replacement bypassed hold';end if;
 if (select count(*) from public.endpoint_services where current_code_id in ('00000000-0000-4000-8000-000000000411','00000000-0000-4000-8000-000000000413'))<>1 then raise exception 'Duplicated entitlement';end if;
end$$;
-- Extensions and plan changes append periods through the same audited engine.
set local role authenticated;
select public.create_service_order('00000000-0000-4000-8000-000000000413',(:'version_result'::jsonb->>'id')::uuid,null,'MANUAL_ADMIN','ADMIN','MANUAL_EXTENSION','manual-extension-test','Approved goodwill extension') as extension_order \gset
select public.confirm_manual_service_order(:'extension_order');
select public.create_service_order('00000000-0000-4000-8000-000000000413',:'monthly',null,'MANUAL_ADMIN','ADMIN','PLAN_CHANGE','manual-plan-change-test','Approved next period change') as plan_order \gset
select public.confirm_manual_service_order(:'plan_order');
reset role;
do $$begin
 if not exists(select 1 from public.service_periods where kind='MANUAL_EXTENSION' and ends_at-starts_at=interval '18 days') then raise exception 'Duration inferred from plan name';end if;
 if not exists(select 1 from public.audit_logs where action='SERVICE_MANUAL_EXTENSION') or not exists(select 1 from public.audit_logs where action='SERVICE_PLAN_CHANGE') or not exists(select 1 from public.audit_logs where action='SERVICE_ACTIVATED') then raise exception 'Missing service audit';end if;
 if exists(select * from saved_periods except select * from public.service_periods) then raise exception 'Administrative adjustment rewrote history';end if;
end$$;
rollback;
\echo 'PASS service: calendar boundaries, activation, immutable versions/history, early/late renewal, duplicate confirmation, suspension, price snapshot, provider seam, same-owner move, replacement'
