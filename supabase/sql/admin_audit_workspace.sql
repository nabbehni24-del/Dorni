-- Bounded audit search. No raw metadata or actor contact information leaves this RPC.
create index if not exists audit_logs_action_time_idx on public.audit_logs(action,created_at desc,id desc);
create function private.admin_audit(p_filters jsonb default '{}',p_export boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f date; t date; snap timestamptz; page_no int; size_no int; result jsonb;
 action_filter text:=coalesce(p_filters->>'action',''); kind_filter text:=coalesce(p_filters->>'kind','');
 entity_filter text:=coalesce(p_filters->>'entity',''); search_filter text:=trim(coalesce(p_filters->>'search',''));
begin
 if not private.support_allowed('view') or public.get_my_internal_role() is distinct from 'SUPER_ADMIN' then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if jsonb_typeof(p_filters) is distinct from 'object' or p_export is null then raise exception 'INVALID_FILTERS';end if;
 f:=(p_filters->>'from')::date;t:=(p_filters->>'to')::date;
 snap:=least(coalesce(nullif(p_filters->>'snapshot','')::timestamptz,clock_timestamp()),clock_timestamp());
 page_no:=coalesce((p_filters->>'page')::int,1);size_no:=coalesce((p_filters->>'size')::int,25);
 if f is null or t is null or t<f or t-f>365 or page_no not between 1 and 10000 or size_no not in (25,50,100)
 or length(action_filter)>100 or length(kind_filter)>60 or length(entity_filter)>100 or length(search_filter)>80 then raise exception 'INVALID_FILTERS';end if;
 with filtered as materialized (
  select id,action,actor_kind,entity_type,entity_id,created_at,actor_id from public.audit_logs
  where created_at>=f::timestamp at time zone 'Africa/Tripoli' and created_at<(t+1)::timestamp at time zone 'Africa/Tripoli' and created_at<=snap
   and (action_filter='' or action=action_filter) and (kind_filter='' or actor_kind=kind_filter) and (entity_filter='' or entity_type=entity_filter)
   and (search_filter='' or strpos(id::text,lower(search_filter))>0 or strpos(coalesce(entity_id::text,''),lower(search_filter))>0)
 ), rows_page as (
  select id,action,actor_kind,entity_type,entity_id,created_at from filtered order by created_at desc,id desc
  limit case when p_export then 10000 else size_no end offset case when p_export then 0 else (page_no-1)*size_no end
 )
 select jsonb_build_object(
  'rows',(select coalesce(jsonb_agg(x order by x.created_at desc,x.id desc),'[]') from rows_page x),
  'total',count(*),'snapshot',snap,'page',page_no,'size',size_no,
  'metrics',jsonb_build_object('total',count(*),'actors',count(distinct actor_id),'actions',count(distinct action),
   'today',count(*) filter(where created_at>=(now() at time zone 'Africa/Tripoli')::date::timestamp at time zone 'Africa/Tripoli')),
  'options',case when p_export then '{}'::jsonb else jsonb_build_object(
   'actions',(select coalesce(jsonb_agg(distinct action order by action),'[]') from public.audit_logs),
   'kinds',(select coalesce(jsonb_agg(distinct actor_kind order by actor_kind),'[]') from public.audit_logs),
   'entities',(select coalesce(jsonb_agg(distinct entity_type order by entity_type),'[]') from public.audit_logs)) end
 ) into result from filtered;
 if p_export then
  if (result->>'total')::bigint>10000 then raise exception 'EXPORT_TOO_LARGE';end if;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,safe_metadata)
  values(auth.uid(),'ADMIN','AUDIT_LOG_EXPORTED','audit_log',jsonb_build_object('rows',result->'total','from',f,'to',t,'snapshot',snap));
 end if;
 return result;
end $$;
revoke all on function private.admin_audit(jsonb,boolean) from public,anon;
grant execute on function private.admin_audit(jsonb,boolean) to authenticated;
create function public.admin_audit(p_filters jsonb default '{}',p_export boolean default false)
returns jsonb language sql security invoker set search_path='' as $$select private.admin_audit(p_filters,p_export)$$;
revoke all on function public.admin_audit(jsonb,boolean) from public,anon;
grant execute on function public.admin_audit(jsonb,boolean) to authenticated;
