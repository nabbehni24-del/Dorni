-- Isolated real-RPC regression; every fixture and settings change is rolled back.
do $test$
declare u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); rid uuid; tid uuid; token text:=gen_random_uuid()::text;
 h text:=repeat('a',32)||replace(gen_random_uuid()::text,'-',''); sh text:=repeat('b',32)||replace(gen_random_uuid()::text,'-',''); result jsonb;
begin
 begin
  insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(u,u::text||'@immediate-escalation.invalid','{}','{}');
  insert into public.vehicles(id,owner_id,manufacturer,model,color) values(v,u,'QA','Rollback','Test');
  insert into public.codes(id,serial_number,public_token,activation_state) values(c,'QA-'||c::text,token,'ACTIVE');
  insert into public.code_assignments(code_id,vehicle_id,assigned_by) values(c,v,u);
  update private.support_center_settings set config=config||'{"enabled":true,"escalationMinutes":1440,"callMinutes":5,"phones":[]}'::jsonb where id;
  perform set_config('role','anon',true);
  select report_id into rid from public.submit_public_report(token,'BLOCKING_EXIT',sh,h);
  if (public.report_support(h)#>>'{support,canEscalate}')::boolean then raise exception 'FAIL unanswered report bypassed wait';end if;
  begin perform public.report_support(h,'escalate');raise exception 'FAIL early escalation accepted';exception when raise_exception then if sqlerrm<>'NOT_READY' then raise;end if;end;
  perform set_config('role','none',true);
  update public.reports set status='ACKNOWLEDGED',owner_response='ON_MY_WAY' where id=rid;
  perform set_config('role','anon',true);
  if (public.report_support(h)#>>'{support,canEscalate}')::boolean then raise exception 'FAIL on-my-way escalation';end if;
  perform set_config('role','none',true);
  update public.reports set owner_response='CANNOT_REACH_NOW' where id=rid;
  perform set_config('role','anon',true);
  result:=public.report_support(h);
  if not (result#>>'{support,canEscalate}')::boolean or (result#>>'{support,escalationAt}')::timestamptz>now() then raise exception 'FAIL inability did not bypass wait';end if;
  perform set_config('role','none',true);
  update private.support_center_settings set config=config||'{"enabled":false}'::jsonb where id;
  perform set_config('role','anon',true);
  begin perform public.report_support(h,'escalate');raise exception 'FAIL disabled center bypassed';exception when raise_exception then if sqlerrm<>'NOT_READY' then raise;end if;end;
  perform set_config('role','none',true);
  update private.support_center_settings set config=config||'{"enabled":true}'::jsonb where id;
  update public.reports set status='RESOLVED' where id=rid;
  perform set_config('role','anon',true);
  begin perform public.report_support(h,'escalate');raise exception 'FAIL resolved report escalated';exception when raise_exception then if sqlerrm<>'NOT_READY' then raise;end if;end;
  perform set_config('role','none',true);
  update public.reports set status='ACKNOWLEDGED' where id=rid;
  perform set_config('role','anon',true);
  result:=public.report_support(h,'escalate');tid:=(result#>>'{support,ticket,id}')::uuid;
  if tid is null or (result#>>'{support,canCall}')::boolean then raise exception 'FAIL immediate escalation or call policy';end if;
  if (public.report_support(h,'escalate')#>>'{support,ticket,id}')::uuid<>tid then raise exception 'FAIL duplicate ticket';end if;
  raise exception 'ROLLBACK_IMMEDIATE_ESCALATION';
 exception when raise_exception then if sqlerrm<>'ROLLBACK_IMMEDIATE_ESCALATION' then raise;end if;
 end;
 if exists(select 1 from auth.users where id=u) or exists(select 1 from public.reports where id=rid) then raise exception 'FAIL fixture leak';end if;
end $test$;
