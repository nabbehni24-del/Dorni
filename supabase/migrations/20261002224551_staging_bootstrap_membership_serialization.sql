begin;
CREATE OR REPLACE FUNCTION public.bootstrap_dorni_admin(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := private.commercial_user();
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not private.runtime_secret_matches('bootstrap',p_token) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('dorni:first-admin',0));
 if exists(select 1 from public.internal_memberships where active) then raise exception 'ALREADY_BOOTSTRAPPED' using errcode='23505'; end if;
 insert into public.internal_memberships(user_id,role_code,active) values(v_user,'SUPER_ADMIN',true);
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id) values(v_user,'ADMIN','ADMIN_BOOTSTRAPPED','internal_membership',v_user);
 return 'SUPER_ADMIN';
end $function$
;
CREATE OR REPLACE FUNCTION public.provision_my_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not exists(select 1 from auth.sessions where id::text=auth.jwt()->>'session_id' and user_id=v_user and (not_after is null or not_after>now()))
    or exists(select 1 from public.profiles where id=v_user and account_status<>'ACTIVE') then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  return private.provision_account(v_user);
end
$function$
;
CREATE OR REPLACE FUNCTION public.org_set_member_role(p_organization_id uuid, p_membership_id uuid, p_role_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select private.commercial_user()); v_member public.partner_memberships%rowtype;
  v_old_role public.organization_roles%rowtype; v_new_role public.organization_roles%rowtype; v_legacy_role text;
begin
  perform 1 from public.partner_organizations where id=p_organization_id for update;
  if not private.has_org_permission(p_organization_id,'ORG_ROLE_ASSIGN',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into v_new_role from public.organization_roles where id=p_role_id and organization_id=p_organization_id and active;
  if v_new_role.id is null then raise exception 'INVALID_ROLE' using errcode='22023'; end if;
  select m.* into v_member from public.partner_memberships m where m.id=p_membership_id and m.organization_id=p_organization_id for update;
  if v_member.id is null then raise exception 'MEMBER_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_old_role from public.organization_roles where id=v_member.role_id and organization_id=p_organization_id;
  if v_old_role.code='PARTNER_ADMIN' and v_new_role.code<>'PARTNER_ADMIN' and
    (select count(*) from public.partner_memberships m join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id
      where m.organization_id=p_organization_id and m.status='ACTIVE' and r.code='PARTNER_ADMIN')<=1
    then raise exception 'LAST_ADMIN_REQUIRED' using errcode='22023'; end if;
  v_legacy_role:=case when v_new_role.code in ('PARTNER_ADMIN','PARTNER_OPERATOR','PARTNER_VIEWER') then v_new_role.code else 'PARTNER_VIEWER' end;
  update public.partner_memberships set role_id=v_new_role.id,role=v_legacy_role where id=v_member.id returning * into v_member;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','ORGANIZATION_MEMBER_ROLE_CHANGED','partner_membership',v_member.id,
    jsonb_build_object('organizationId',p_organization_id,'oldRoleId',v_old_role.id,'newRoleId',v_new_role.id));
  return jsonb_build_object('id',v_member.id,'roleId',v_member.role_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.org_set_member_status(p_organization_id uuid, p_membership_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_actor_membership uuid; v_member public.partner_memberships%rowtype; v_role_code text;
begin
  perform 1 from public.partner_organizations where id=p_organization_id for update;
  if not private.has_org_permission(p_organization_id,'ORG_MEMBER_SUSPEND',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_status not in ('ACTIVE','SUSPENDED') then raise exception 'INVALID_STATUS' using errcode='22023'; end if;
  select id into v_actor_membership from public.partner_memberships where organization_id=p_organization_id and user_id=v_user and status='ACTIVE';
  if p_membership_id=v_actor_membership then raise exception 'CANNOT_SUSPEND_SELF' using errcode='22023'; end if;
  select * into v_member from public.partner_memberships
    where id=p_membership_id and organization_id=p_organization_id for update;
  if v_member.id is null then raise exception 'MEMBER_NOT_FOUND' using errcode='P0002'; end if;
  select code into v_role_code from public.organization_roles
    where id=v_member.role_id and organization_id=p_organization_id;
  if p_status='SUSPENDED' and v_member.status='ACTIVE' and v_role_code='PARTNER_ADMIN' and
    (select count(*) from public.partner_memberships m join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id
      where m.organization_id=p_organization_id and m.status='ACTIVE' and r.code='PARTNER_ADMIN')<=1
    then raise exception 'LAST_ADMIN_REQUIRED' using errcode='22023'; end if;
  update public.partner_memberships set status=p_status where id=v_member.id returning * into v_member;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER',case when p_status='ACTIVE' then 'ORGANIZATION_MEMBER_REACTIVATED' else 'ORGANIZATION_MEMBER_SUSPENDED' end,
    'partner_membership',v_member.id,jsonb_build_object('organizationId',p_organization_id));
  return jsonb_build_object('id',v_member.id,'status',v_member.status);
end $function$
;
commit;
