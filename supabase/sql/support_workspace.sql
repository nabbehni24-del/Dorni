-- Hosted migration: support_workspace. No local Supabase CLI is installed.
-- Capabilities are server-owned, never derived from editable user metadata.
alter table public.internal_memberships add column support_permissions text[] not null default '{}'
 check (support_permissions <@ array['view','view_all','reply','notes','status','assign']::text[]);
alter table public.support_messages add column client_request_id uuid;
create unique index support_message_idempotency on public.support_messages(ticket_id,author_id,client_request_id) where client_request_id is not null;
create index support_tickets_updated_id on public.support_tickets(updated_at desc,id);
create index support_tickets_assigned_updated on public.support_tickets(assigned_to,updated_at desc);

-- SUPPORT must not inherit broad internal access to customers, exports or partners.
create or replace function private.is_internal() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.internal_memberships i where i.user_id=(select auth.uid()) and i.active and i.role_code<>'SUPPORT')
$$;

create function private.support_allowed(p_permission text,p_ticket uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from public.internal_memberships i join public.profiles p on p.id=i.user_id
  where i.user_id=(select auth.uid()) and i.active and p.account_status='ACTIVE'
   and exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=i.user_id and (s.not_after is null or s.not_after>now()))
   and (i.role_code='SUPER_ADMIN' or (i.role_code='SUPPORT' and 'view'=any(i.support_permissions)
    and p_permission=any(i.support_permissions)
    and (p_ticket is null or 'view_all'=any(i.support_permissions) or exists(select 1 from public.support_tickets t where t.id=p_ticket and t.assigned_to=i.user_id))))
 )
$$;
revoke all on function private.support_allowed(text,uuid) from public,anon;
grant execute on function private.support_allowed(text,uuid) to authenticated;

drop policy support_requester_read on public.support_tickets;
create policy support_requester_read on public.support_tickets for select to authenticated using (
 requester_id=(select auth.uid()) or (organization_id is not null and private.is_partner_member(organization_id)) or private.support_allowed('view',id)
);
drop policy support_messages_read on public.support_messages;
create policy support_messages_read on public.support_messages for select to authenticated using (
 exists(select 1 from public.support_tickets t where t.id=ticket_id and (
  (not is_internal and (t.requester_id=(select auth.uid()) or (t.organization_id is not null and private.is_partner_member(t.organization_id))))
  or private.support_allowed(case when is_internal then 'notes' else 'view' end,t.id)))
);
revoke insert,update,delete on public.support_tickets,public.support_messages from authenticated,anon;

create function private.support_workspace(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); tid uuid; target uuid; state text; old_time timestamptz; permissions text[]; body text; internal boolean; request_id uuid; result jsonb; page_num int;
begin
 if not private.support_allowed('view') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_action='list' then
  page_num:=greatest(0,least(10000,coalesce((p_data->>'page')::int,0)));
  select case when role_code='SUPER_ADMIN' then array['view','view_all','reply','notes','status','assign']::text[] else support_permissions end into permissions from public.internal_memberships where user_id=u;
  return jsonb_build_object('userId',u,'permissions',permissions,'admin',exists(select 1 from public.internal_memberships where user_id=u and role_code='SUPER_ADMIN' and active),
   'metrics',(select jsonb_build_object('open',count(*) filter(where status='OPEN'),'progress',count(*) filter(where status='IN_PROGRESS'),'waiting',count(*) filter(where status='WAITING_FOR_USER'),'resolved',count(*) filter(where status in ('RESOLVED','CLOSED'))) from public.support_tickets where private.support_allowed('view',id)),
   'total',(select count(*) from public.support_tickets where private.support_allowed('view',id) and (coalesce(p_data->>'status','')='' or status=p_data->>'status') and (coalesce(p_data->>'search','')='' or strpos(lower(subject),lower(p_data->>'search'))>0 or id::text=p_data->>'search')),
   'tickets',(select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at desc,t.id),'[]') from (
    select t.id,t.subject,t.category,t.status,t.assigned_to,t.created_at,t.updated_at,p.full_name as requester_name,a.full_name as assignee_name
    from public.support_tickets t join public.profiles p on p.id=t.requester_id left join public.profiles a on a.id=t.assigned_to
    where private.support_allowed('view',t.id) and (coalesce(p_data->>'status','')='' or t.status=p_data->>'status') and (coalesce(p_data->>'search','')='' or strpos(lower(t.subject),lower(p_data->>'search'))>0 or t.id::text=p_data->>'search')
    order by t.updated_at desc,t.id limit 30 offset page_num*30) t),
   'agents',case when private.support_allowed('assign') then (select coalesce(jsonb_agg(jsonb_build_object('id',i.user_id,'name',p.full_name)),'[]') from public.internal_memberships i join public.profiles p on p.id=i.user_id where i.active and p.account_status='ACTIVE' and (i.role_code='SUPER_ADMIN' or (i.role_code='SUPPORT' and 'view'=any(i.support_permissions)))) else '[]'::jsonb end);
 end if;
 tid:=(p_data->>'id')::uuid;
 if tid is null or not private.support_allowed('view',tid) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_action='thread' then
  select jsonb_build_object('ticket',jsonb_build_object('id',t.id,'subject',t.subject,'description',t.description,'status',t.status,'category',t.category,'assigned_to',t.assigned_to,'created_at',t.created_at,'updated_at',t.updated_at,'requester_name',p.full_name),
   'messages',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]') from (
    select m.id,m.body,m.is_internal as internal,m.created_at,m.author_id=u as mine,case when m.author_id=t.requester_id then 'CUSTOMER' else 'STAFF' end as author_kind,p.full_name as author_name
    from public.support_messages m join public.profiles p on p.id=m.author_id where m.ticket_id=tid and (not m.is_internal or private.support_allowed('notes',tid))
    and (nullif(p_data->>'before','') is null or (m.created_at,m.id)<(select x.created_at,x.id from public.support_messages x where x.id=(p_data->>'before')::uuid and x.ticket_id=tid and (not x.is_internal or private.support_allowed('notes',tid))))
    order by m.created_at desc,m.id desc limit 100) m)) into result
  from public.support_tickets t join public.profiles p on p.id=t.requester_id where t.id=tid;
  if result is null then raise exception 'NOT_FOUND'; end if;
  return result;
 end if;
 select status,updated_at into state,old_time from public.support_tickets where id=tid for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 -- Re-check row scope after waiting for a concurrent assignment.
 if not private.support_allowed('view',tid) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_action='reply' then
  internal:=coalesce((p_data->>'internal')::boolean,false); body:=trim(coalesce(p_data->>'body','')); request_id:=(p_data->>'requestId')::uuid;
  if not private.support_allowed(case when internal then 'notes' else 'reply' end,tid) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if length(body) not between 1 and 4000 or request_id is null then raise exception 'INVALID_INPUT'; end if;
  if exists(select 1 from public.support_messages where ticket_id=tid and author_id=u and client_request_id=request_id) then return jsonb_build_object('ok',true); end if;
  if state in ('CLOSED','RESOLVED') then raise exception 'TICKET_CLOSED'; end if;
  insert into public.support_messages(ticket_id,author_id,body,is_internal,client_request_id) values(tid,u,body,internal,request_id);
  -- Reply permission does not implicitly grant status permission.
  update public.support_tickets set updated_at=clock_timestamp() where id=tid;
 elsif p_action='status' then
  if not private.support_allowed('status',tid) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if nullif(p_data->>'updatedAt','')::timestamptz is distinct from old_time then raise exception 'CONFLICT'; end if;
  if coalesce(p_data->>'status','') not in ('OPEN','IN_PROGRESS','WAITING_FOR_USER','RESOLVED','CLOSED') then raise exception 'INVALID_INPUT'; end if;
  update public.support_tickets set status=p_data->>'status' where id=tid;
 elsif p_action='assign' then
  if not private.support_allowed('assign',tid) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if nullif(p_data->>'updatedAt','')::timestamptz is distinct from old_time then raise exception 'CONFLICT'; end if;
  target:=nullif(p_data->>'assignee','')::uuid;
  if target is not null and not exists(select 1 from public.internal_memberships i join public.profiles p on p.id=i.user_id where i.user_id=target and i.active and p.account_status='ACTIVE' and (i.role_code='SUPER_ADMIN' or (i.role_code='SUPPORT' and 'view'=any(i.support_permissions)))) then raise exception 'INVALID_ASSIGNEE'; end if;
  update public.support_tickets set assigned_to=target where id=tid;
 else raise exception 'INVALID_ACTION'; end if;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
 values(u,'ADMIN','SUPPORT_'||upper(p_action),'support_ticket',tid,jsonb_build_object('internal',internal,'status',case when p_action='status' then p_data->>'status' end,'assigned_to',target));
 return jsonb_build_object('ok',true);
end $$;

-- Add only these tables; preserve existing publication contents.
do $$ begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_tickets') then alter publication supabase_realtime add table public.support_tickets; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_messages') then alter publication supabase_realtime add table public.support_messages; end if;
end $$;
revoke all on function private.support_workspace(text,jsonb) from public,anon;
grant execute on function private.support_workspace(text,jsonb) to authenticated;
create function public.support_workspace(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.support_workspace(p_action,p_data) $$;
revoke all on function public.support_workspace(text,jsonb) from public,anon;
grant execute on function public.support_workspace(text,jsonb) to authenticated;

create function private.support_staff_admin(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); target uuid; existing_role text; perms text[]; enabled boolean;
begin
 if not private.support_allowed('view') or not exists(select 1 from public.internal_memberships where user_id=u and active and role_code='SUPER_ADMIN') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_action='list' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',i.user_id,'name',p.full_name,'email',a.email,'active',i.active,'permissions',i.support_permissions) order by i.created_at),'[]') from public.internal_memberships i join public.profiles p on p.id=i.user_id join auth.users a on a.id=i.user_id where i.role_code='SUPPORT');
 elsif p_action='save' then
  if nullif(p_data->>'id','') is not null then
   target:=(p_data->>'id')::uuid;
   if not exists(select 1 from public.internal_memberships where user_id=target and role_code='SUPPORT') then raise exception 'NOT_FOUND'; end if;
  else
   select a.id into target from auth.users a join public.profiles p on p.id=a.id where lower(a.email)=lower(trim(p_data->>'email')) and a.email_confirmed_at is not null and p.account_status='ACTIVE';
   if target is null then raise exception 'REGISTER_FIRST'; end if;
  end if;
  -- Serialize grants for a user and never replace another internal role.
  perform 1 from public.profiles where id=target for update;
  select role_code into existing_role from public.internal_memberships where user_id=target for update;
  if target=u or (existing_role is not null and existing_role<>'SUPPORT') then raise exception 'ROLE_CONFLICT'; end if;
  if jsonb_typeof(p_data->'permissions') is distinct from 'array' then raise exception 'INVALID_INPUT'; end if;
  select coalesce(array_agg(distinct x),'{}') into perms from jsonb_array_elements_text(p_data->'permissions') x;
  if not perms <@ array['view','view_all','reply','notes','status','assign']::text[] or not 'view'=any(perms) then raise exception 'INVALID_INPUT'; end if;
  enabled:=coalesce((p_data->>'active')::boolean,true);
  insert into public.internal_memberships(user_id,role_code,active,support_permissions) values(target,'SUPPORT',enabled,perms)
   on conflict(user_id) do update set active=excluded.active,support_permissions=excluded.support_permissions;
  if not enabled then update public.support_tickets set assigned_to=null where assigned_to=target and status not in ('RESOLVED','CLOSED'); end if;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(u,'ADMIN','SUPPORT_STAFF_SAVE','internal_membership',target,jsonb_build_object('active',enabled,'permissions',perms));
  return jsonb_build_object('ok',true);
 else raise exception 'INVALID_ACTION'; end if;
end $$;
revoke all on function private.support_staff_admin(text,jsonb) from public,anon;
grant execute on function private.support_staff_admin(text,jsonb) to authenticated;
create function public.support_staff_admin(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.support_staff_admin(p_action,p_data) $$;
revoke all on function public.support_staff_admin(text,jsonb) from public,anon;
grant execute on function public.support_staff_admin(text,jsonb) to authenticated;

-- Harden the existing endpoints too; no legacy route may bypass capability checks.
do $$
declare definition text; needle text;
begin
 definition:=pg_get_functiondef('private.owner_workspace(text,jsonb)'::regprocedure);
 needle:='select exists(select 1 from public.internal_memberships where user_id=u and active and role_code in (''SUPER_ADMIN'',''SUPPORT'',''OPERATIONS'')) into staff;';
 if strpos(definition,needle)=0 then raise exception 'Unexpected owner workspace definition'; end if;
 definition:=replace(definition,needle,'staff:=false; if p_action in (''staff_tickets'',''staff_reply'') then raise exception ''USE_SUPPORT_WORKSPACE'' using errcode=''42501''; end if;');
 definition:=replace(definition,'''staff'',staff','''staff'',private.support_allowed(''view'')');
 execute definition;
 definition:=pg_get_functiondef('public.get_my_account_context()'::regprocedure);
 if strpos(definition,'when v_internal is not null then ''/admin''')=0 then raise exception 'Unexpected account context definition'; end if;
 execute replace(definition,'when v_internal is not null then ''/admin''','when v_internal=''SUPPORT'' then ''/support'' when v_internal is not null then ''/admin''');
 -- SQL NULL must not slip through the existing admin guard.
 definition:=pg_get_functiondef('public.get_admin_overview()'::regprocedure);
 execute replace(definition,'if v_role <> ''SUPER_ADMIN''','if v_role is distinct from ''SUPER_ADMIN''');
end $$;
