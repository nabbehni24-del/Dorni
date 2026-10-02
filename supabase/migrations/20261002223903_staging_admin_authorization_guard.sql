begin;
-- Staging verification fix: fail closed on missing role and require live session.
CREATE OR REPLACE FUNCTION public.admin_review_batch_request(p_request_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := private.commercial_user(); v_role text; v_request public.partner_batch_requests%rowtype;
begin
  select role_code into v_role from public.internal_memberships where user_id=v_user and active;
  if v_role is distinct from 'SUPER_ADMIN' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_status not in ('APPROVED','REJECTED') then raise exception 'INVALID_STATUS' using errcode='22023'; end if;
  if p_note is not null and char_length(p_note)>1000 then raise exception 'INVALID_NOTE' using errcode='22023'; end if;

  update public.partner_batch_requests set
    status=p_status,
    reviewed_at=now(),
    reviewed_by=v_user,
    review_note=nullif(trim(coalesce(p_note,'')),'')
  where id=p_request_id and status='PENDING'
  returning * into v_request;
  if v_request.id is null then raise exception 'REQUEST_NOT_PENDING' using errcode='22023'; end if;

  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'ADMIN','BATCH_REQUEST_REVIEWED','partner_batch_request',v_request.id,
    jsonb_build_object('status',p_status,'organizationId',v_request.organization_id,'quantity',v_request.quantity));
  return to_jsonb(v_request);
end $function$
;
CREATE OR REPLACE FUNCTION public.create_partner_organization(p_name text, p_type text, p_admin_email text, p_invite_token_hash text, p_trusted_generation boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := private.commercial_user();
  v_role text;
  v_org public.partner_organizations%rowtype;
  v_partner_user uuid;
  v_membership public.partner_memberships%rowtype;
  v_invite public.partner_invitations%rowtype;
begin
  select role_code into v_role from public.internal_memberships where user_id=v_user and active;
  if v_role is distinct from 'SUPER_ADMIN' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_type not in ('INSURANCE','CORPORATE','DISTRIBUTOR','OTHER') then raise exception 'INVALID_PARTNER_TYPE' using errcode='22023'; end if;
  if nullif(trim(p_name),'') is null or char_length(trim(p_name))>160 or nullif(trim(p_admin_email),'') is null then
    raise exception 'INVALID_PARTNER' using errcode='22023';
  end if;

  insert into public.partner_organizations(name,type,status,trusted_generation)
  values(trim(p_name),p_type,'ACTIVE',p_trusted_generation) returning * into v_org;
  select id into v_partner_user from auth.users where lower(email)=lower(trim(p_admin_email)) limit 1;
  if v_partner_user is not null then
    insert into public.partner_memberships(organization_id,user_id,role,status)
    values(v_org.id,v_partner_user,'PARTNER_ADMIN','ACTIVE') returning * into v_membership;
  else
    insert into public.partner_invitations(organization_id,email,role,token_hash,created_by)
    values(v_org.id,lower(trim(p_admin_email)),'PARTNER_ADMIN',p_invite_token_hash,v_user) returning * into v_invite;
  end if;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'ADMIN','PARTNER_CREATED','partner_organization',v_org.id,jsonb_build_object('trustedGeneration',p_trusted_generation));
  return jsonb_build_object(
    'organization',to_jsonb(v_org),
    'membership',case when v_membership.id is null then null else to_jsonb(v_membership) end,
    'invitation',case when v_invite.id is null then null else jsonb_build_object('id',v_invite.id,'email',v_invite.email,'expiresAt',v_invite.expires_at) end
  );
end $function$
;
commit;
