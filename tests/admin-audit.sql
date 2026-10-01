-- Actual RPC regression; all accounts, sessions, logs and exports roll back.
do $test$
declare u uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); entity uuid:=gen_random_uuid(); large_entity uuid:=gen_random_uuid(); boundary uuid:=gen_random_uuid(); f jsonb; a jsonb; b jsonb; snap text; today date:=(now() at time zone 'Africa/Tripoli')::date;
begin
 begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) values(u,u::text||'@audit-qa.invalid',now(),'{}','{}');
  insert into auth.sessions(id,user_id,created_at) values(sid,u,now());
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',sid,'role','authenticated')::text,true);
  f:=jsonb_build_object('from',today-1,'to',today+1,'search',entity,'page',1,'size',25);
  perform set_config('role','anon',true);
  begin perform public.admin_audit(f);raise exception 'FAIL anonymous access';exception when insufficient_privilege then null;end;
  perform set_config('role','authenticated',true);
  begin perform public.admin_audit(f);raise exception 'FAIL ordinary account access';exception when insufficient_privilege then null;end;
  perform set_config('role','none',true);
  insert into public.internal_memberships(user_id,role_code) values(u,'SUPER_ADMIN');
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,created_at,safe_metadata)
   select u,case when i%2=0 then 'ADMIN' else 'OWNER' end,case when i%2=0 then 'SUPPORT_REPLY' else 'REPORT_RESPONDED' end,'report',entity,now()-i*interval '1 second','{"secret":"MUST_NOT_LEAK"}' from generate_series(1,60) i;
  perform set_config('role','authenticated',true);
  a:=public.admin_audit(f);snap:=a->>'snapshot';
  if (a->>'total')::int<>60 or jsonb_array_length(a->'rows')<>25 or (a#>>'{metrics,actors}')::int<>1 or (a#>>'{metrics,actions}')::int<>2 then raise exception 'FAIL metrics/page';end if;
  if a::text like '%MUST_NOT_LEAK%' or a->'rows'->0 ? 'actor_id' then raise exception 'FAIL unsafe projection';end if;
  b:=public.admin_audit(f||jsonb_build_object('page',2,'snapshot',snap));
  if exists(select 1 from jsonb_array_elements(a->'rows') x join jsonb_array_elements(b->'rows') y on x->>'id'=y->>'id') then raise exception 'FAIL page overlap';end if;
  b:=public.admin_audit(f||'{"action":"REPORT_RESPONDED","kind":"OWNER","entity":"report"}');
  if (b->>'total')::int<>30 then raise exception 'FAIL combined filters';end if;
  perform set_config('role','none',true);
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,created_at) values(u,'ADMIN','QA_NEW','report',entity,clock_timestamp());
  perform set_config('role','authenticated',true);
  b:=public.admin_audit(f||jsonb_build_object('snapshot',snap),true);
  if (b->>'total')::int<>60 or jsonb_array_length(b->'rows')<>60 then raise exception 'FAIL export snapshot mismatch';end if;
  perform set_config('role','none',true);
  if not exists(select 1 from public.audit_logs where actor_id=u and action='AUDIT_LOG_EXPORTED') then raise exception 'FAIL export not audited';end if;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,created_at) values
   (u,'ADMIN','QA_BOUNDARY','report',boundary,(today-1)::timestamp at time zone 'Africa/Tripoli'),
   (u,'ADMIN','QA_BOUNDARY','report',boundary,today::timestamp at time zone 'Africa/Tripoli');
  perform set_config('role','authenticated',true);
  b:=public.admin_audit(jsonb_build_object('from',today-1,'to',today-1,'search',boundary));
  if (b->>'total')::int<>1 then raise exception 'FAIL inclusive Libya date boundaries';end if;
  perform set_config('role','none',true);
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id) select u,'ADMIN','QA_LIMIT','report',large_entity from generate_series(1,10001);
  perform set_config('role','authenticated',true);
  begin perform public.admin_audit(f||jsonb_build_object('search',large_entity),true);raise exception 'FAIL truncated export allowed';exception when raise_exception then if sqlerrm<>'EXPORT_TOO_LARGE' then raise;end if;end;
  perform set_config('role','none',true);
  delete from auth.sessions where id=sid;
  perform set_config('role','authenticated',true);
  begin perform public.admin_audit(f);raise exception 'FAIL revoked session access';exception when insufficient_privilege then null;end;
  raise exception 'ROLLBACK_AUDIT_TEST';
 exception when raise_exception then if sqlerrm<>'ROLLBACK_AUDIT_TEST' then raise;end if;
 end;
 if exists(select 1 from auth.users where id=u) or exists(select 1 from public.audit_logs where entity_id=entity) then raise exception 'FAIL leaked fixture';end if;
end $test$;
