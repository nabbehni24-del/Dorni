-- Real database assertions in an always-rolled-back subtransaction. No messages/fixtures persist.
do $test$
declare a uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); rid uuid:=gen_random_uuid(); tid uuid; h text:=gen_random_uuid()::text; result jsonb; config jsonb;
begin
 begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) values(a,a::text||'@report-center-test.invalid',now(),'{}','{}');
  insert into auth.sessions(id,user_id,created_at) values(sid,a,now());
  insert into public.internal_memberships(user_id,role_code) values(a,'SUPER_ADMIN');
  insert into public.reports(id,code_id,vehicle_id,scanner_session_id,report_type_code,status,status_token_hash,expires_at,created_at)
   select rid,code_id,vehicle_id,scanner_session_id,report_type_code,'ACTIVE',h,now()+interval '1 hour',now() from public.reports limit 1;
  if not found then raise exception 'Need a report reference for rollback fixture';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'session_id',sid,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  config:=jsonb_build_object('enabled',true,'escalationMinutes',2,'callMinutes',5,'hours','QA','instructions','QA','phones',jsonb_build_array(jsonb_build_object('label','QA','number','+218910000000')));
  perform public.support_center_admin('save',config);
  perform set_config('role','anon',true);
  begin perform public.support_center_admin('get');raise exception 'FAIL anonymous admin access';exception when insufficient_privilege then null;end;
  begin perform public.report_support('invalid');raise exception 'FAIL invalid token';exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise;end if;end;
  begin perform public.report_support(h,'escalate');raise exception 'FAIL early escalation';exception when raise_exception then if sqlerrm<>'NOT_READY' then raise;end if;end;
  perform set_config('role','none',true);
  update public.reports set created_at=now()-interval '3 minutes' where id=rid;
  perform set_config('role','anon',true);
  result:=public.report_support(h,'escalate');tid:=(result#>>'{support,ticket,id}')::uuid;
  if tid is null or (result#>>'{support,canCall}')::boolean or result#>'{support,contact}'<>'null'::jsonb then raise exception 'FAIL early call';end if;
  if (public.report_support(h,'escalate')#>>'{support,ticket,id}')::uuid<>tid then raise exception 'FAIL idempotency';end if;
  if result::text like '%ownerName%' or result::text like '%ownerId%' or result::text like '%serial%' then raise exception 'FAIL public data leak';end if;
  perform set_config('role','none',true);
  update public.support_tickets set created_at=now()-interval '6 minutes' where id=tid;
  perform set_config('role','authenticated',true);
  result:=public.support_workspace('thread',jsonb_build_object('id',tid));
  if result#>>'{ticket,report_context,reportId}'<>rid::text then raise exception 'FAIL staff report context';end if;
  if not exists(select 1 from jsonb_array_elements(public.support_workspace('list')->'tickets') j where j->>'id'=tid::text) then raise exception 'FAIL anonymous ticket absent';end if;
  perform public.support_workspace('reply',jsonb_build_object('id',tid,'body','PRIVATE QA NOTE','internal',true,'requestId',gen_random_uuid()));
  perform set_config('role','anon',true);
  result:=public.report_support(h);
  if not (result#>>'{support,canCall}')::boolean or jsonb_array_length(result#>'{support,messages}')<>0 then raise exception 'FAIL private note/contact';end if;
  perform set_config('role','authenticated',true);
  perform public.support_workspace('reply',jsonb_build_object('id',tid,'body','PUBLIC QA REPLY','internal',false,'requestId',gen_random_uuid()));
  perform set_config('role','anon',true);
  result:=public.report_support(h);
  if (result#>>'{support,canCall}')::boolean or result#>>'{support,messages,0,body}'<>'PUBLIC QA REPLY' then raise exception 'FAIL reply not reflected';end if;
  perform set_config('role','none',true);
  update public.reports set expires_at=now()-interval '1 second' where id=rid;
  perform set_config('role','anon',true);
  begin perform public.report_support(h);raise exception 'FAIL expired access';exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise;end if;end;
  raise exception 'ROLLBACK_REPORT_CENTER_TEST';
 exception when raise_exception then if sqlerrm<>'ROLLBACK_REPORT_CENTER_TEST' then raise;end if;
 end;
 if exists(select 1 from auth.users where id=a) or exists(select 1 from public.reports where id=rid) then raise exception 'FAIL fixture leak';end if;
end $test$;
