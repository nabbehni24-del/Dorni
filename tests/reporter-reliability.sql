-- Exercise the actual submission RPC, not a fabricated status-only fixture.
-- All rows, events, broadcasts and queued notifications roll back atomically.
do $test$
declare u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); rid uuid; retry uuid; token text:=gen_random_uuid()::text;
 h1 text:=repeat('a',32)||replace(gen_random_uuid()::text,'-',''); h2 text:=repeat('b',32)||replace(gen_random_uuid()::text,'-',''); sh text:=repeat('c',32)||replace(gen_random_uuid()::text,'-',''); result jsonb; count_before int; expected_topic text;
begin
 begin
  insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(u,u::text||'@report-reliability.invalid','{}','{}');
  insert into public.vehicles(id,owner_id,manufacturer,model,color) values(v,u,'QA','Rollback','Test');
  insert into public.codes(id,serial_number,public_token,activation_state) values(c,'QA-'||c::text,token,'ACTIVE');
  insert into public.code_assignments(code_id,vehicle_id,assigned_by) values(c,v,u);
  perform set_config('role','anon',true);
  select report_id into rid from public.submit_public_report(token,'BLOCKING_EXIT',sh,h1);
  if rid is null then raise exception 'FAIL initial submission';end if;
  result:=public.report_support(h1);
  if result->>'status'<>'ACTIVE' then raise exception 'FAIL original lookup';end if;
  select report_id into retry from public.submit_public_report(token,'BLOCKING_EXIT',sh,h2);
  if retry<>rid then raise exception 'FAIL duplicate not aggregated';end if;
  if public.report_support(h2)->>'reference'<>result->>'reference' then raise exception 'FAIL duplicate capability missing';end if;
  if not exists(select 1 from public.get_public_report_status(h2)) then raise exception 'FAIL legacy alias lookup';end if;
  select report_id into retry from public.submit_public_report(token,'BLOCKING_EXIT',sh,h2);
  if retry<>rid then raise exception 'FAIL retry changed report';end if;
  begin perform public.submit_public_report(token,'BLOCKING_EXIT',repeat('d',64),h2);raise exception 'FAIL another session reused capability';exception when raise_exception then if sqlerrm<>'REQUEST_CONFLICT' then raise;end if;end;
  perform set_config('role','none',true);
  if (select duplicate_count from public.reports where id=rid)<>2 then raise exception 'FAIL retry increments duplicate count';end if;
  if (select count(*) from private.report_access_tokens where report_id=rid)<>2 then raise exception 'FAIL alias cardinality';end if;
  select count(*) into count_before from public.notification_messages where report_id=rid;
  if count_before<>1 then raise exception 'FAIL duplicate owner notification';end if;
  update public.reports set status='ACKNOWLEDGED',owner_response='ON_MY_WAY' where id=rid;
  select 'report:'||live_topic::text into expected_topic from public.reports where id=rid;
  if not exists(select 1 from realtime.messages m where m.topic=expected_topic and m.event='refresh') then raise exception 'FAIL realtime invalidation';end if;
  perform set_config('role','anon',true);
  if public.report_support(h1)->>'ownerResponse'<>'ON_MY_WAY' or public.report_support(h2)->>'ownerResponse'<>'ON_MY_WAY' then raise exception 'FAIL alias response divergence';end if;
  begin perform 1 from private.report_access_tokens limit 1;raise exception 'FAIL anonymous alias table access';exception when insufficient_privilege then null;end;
  perform set_config('role','none',true);
  update public.reports set expires_at=now()-interval '1 second' where id=rid;
  perform set_config('role','anon',true);
  begin perform public.report_support(h2);raise exception 'FAIL alias outlives report';exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise;end if;end;
  raise exception 'ROLLBACK_REPORT_RELIABILITY';
 exception when raise_exception then if sqlerrm<>'ROLLBACK_REPORT_RELIABILITY' then raise;end if;
 end;
 if exists(select 1 from auth.users where id=u) or exists(select 1 from public.reports where id=rid) then raise exception 'FAIL fixture leak';end if;
end $test$;
