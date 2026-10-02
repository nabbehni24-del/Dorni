-- Staging verification fix: invitation grants a role, so require both permissions.
-- Production deployment remains a separate approval gate.
begin;
CREATE OR REPLACE FUNCTION public.org_invite_member(p_organization_id uuid, p_email text, p_role_id uuid, p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_inv public.partner_invitations%rowtype; v_legacy_role text;
begin
  perform 1 from public.partner_organizations where id=p_organization_id for update;
  if not private.has_org_permission(p_organization_id,'ORG_MEMBER_INVITE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not private.has_org_permission(p_organization_id,'ORG_ROLE_ASSIGN',v_user) then raise exception 'ROLE_ASSIGN_REQUIRED' using errcode='42501'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or nullif(trim(p_email),'') is null then raise exception 'INVALID_INVITATION' using errcode='22023'; end if;
  select case when code in ('PARTNER_ADMIN','PARTNER_OPERATOR','PARTNER_VIEWER') then code else 'PARTNER_VIEWER' end
    into v_legacy_role from public.organization_roles
    where id=p_role_id and organization_id=p_organization_id and active;
  if v_legacy_role is null then raise exception 'INVALID_ROLE' using errcode='22023'; end if;
  update public.partner_invitations set revoked_at=now(),revoked_by=v_user
    where organization_id=p_organization_id and lower(email)=lower(trim(p_email)) and claimed_at is null and revoked_at is null;
  insert into public.partner_invitations(organization_id,email,role,role_id,token_hash,created_by)
  values(p_organization_id,lower(trim(p_email)),v_legacy_role,p_role_id,p_token_hash,v_user) returning * into v_inv;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','ORGANIZATION_MEMBER_INVITED','partner_invitation',v_inv.id,
    jsonb_build_object('organizationId',p_organization_id,'roleId',p_role_id));
  return jsonb_build_object('id',v_inv.id,'email',v_inv.email,'expiresAt',v_inv.expires_at);
end $function$

;
commit;
