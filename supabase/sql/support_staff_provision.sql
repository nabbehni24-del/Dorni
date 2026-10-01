-- A caller-scoped RPC keeps provisioning audited and bound to a live admin session.
create or replace function private.support_staff_admin(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); target uuid; existing_role text; perms text[]; enabled boolean;
begin
 if not private.support_allowed('view') or not exists(select 1 from public.internal_memberships where user_id=u and active and role_code='SUPER_ADMIN') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_action='list' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',i.user_id,'name',p.full_name,'email',a.email,'active',i.active,'activated',a.email_confirmed_at is not null,'permissions',i.support_permissions) order by i.created_at),'[]') from public.internal_memberships i join public.profiles p on p.id=i.user_id join auth.users a on a.id=i.user_id where i.role_code='SUPPORT');
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
create or replace function private.support_staff_provision(p_user_id uuid,p_permissions text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if not private.support_allowed('view') or not exists(select 1 from public.internal_memberships where user_id=u and active and role_code='SUPER_ADMIN') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_permissions is null or not p_permissions <@ array['view','view_all','reply','notes','status','assign']::text[] or not 'view'=any(p_permissions) then raise exception 'INVALID_INPUT'; end if;
 perform 1 from public.profiles where id=p_user_id and account_status='ACTIVE' for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if not exists(select 1 from auth.users where id=p_user_id and raw_app_meta_data->>'staff_provisioned_by'=u::text and email_confirmed_at is null) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if exists(select 1 from public.internal_memberships where user_id=p_user_id) or p_user_id=u then raise exception 'ROLE_CONFLICT'; end if;
 insert into public.internal_memberships(user_id,role_code,active,support_permissions) values(p_user_id,'SUPPORT',true,p_permissions);
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(u,'ADMIN','SUPPORT_STAFF_CREATE','internal_membership',p_user_id,jsonb_build_object('permissions',p_permissions));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function private.support_staff_provision(uuid,text[]) from public,anon;
grant execute on function private.support_staff_provision(uuid,text[]) to authenticated;
create or replace function public.support_staff_provision(p_user_id uuid,p_permissions text[]) returns jsonb language sql security invoker set search_path='' as $$ select private.support_staff_provision(p_user_id,p_permissions) $$;
revoke all on function public.support_staff_provision(uuid,text[]) from public,anon;
grant execute on function public.support_staff_provision(uuid,text[]) to authenticated;
