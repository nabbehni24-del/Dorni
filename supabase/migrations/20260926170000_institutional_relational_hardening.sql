begin;

-- Make institutional verification an explicit state instead of inferring it
-- from the commercial partner lifecycle.
alter table public.partner_organizations
  add column if not exists institutional_status text not null default 'NOT_VERIFIED',
  add column if not exists institutional_status_note text;

update public.partner_organizations
set institutional_status = case when institutional_enabled then 'VERIFIED' else 'NOT_VERIFIED' end
where institutional_status = 'NOT_VERIFIED';

alter table public.partner_organizations drop constraint if exists partner_organizations_institutional_status_check;
alter table public.partner_organizations add constraint partner_organizations_institutional_status_check
  check (institutional_status in ('NOT_VERIFIED','VERIFIED','SUSPENDED','REJECTED'));

-- Enforce tenant ownership with composite foreign keys. Application checks are
-- still kept, but the database now rejects cross-organization relationships.
alter table public.organization_roles
  add constraint organization_roles_id_organization_key unique (id, organization_id);

alter table public.partner_memberships
  add constraint partner_memberships_id_organization_user_key unique (id, organization_id, user_id);

alter table public.partner_memberships drop constraint if exists partner_memberships_role_organization_fkey;
alter table public.partner_memberships add constraint partner_memberships_role_organization_fkey
  foreign key (role_id, organization_id)
  references public.organization_roles(id, organization_id);

alter table public.partner_invitations drop constraint if exists partner_invitations_role_organization_fkey;
alter table public.partner_invitations add constraint partner_invitations_role_organization_fkey
  foreign key (role_id, organization_id)
  references public.organization_roles(id, organization_id);

alter table public.institutional_action_reasons
  add constraint institutional_action_reasons_type_code_key unique (action_type, code);

alter table public.institutional_actions drop constraint if exists institutional_actions_type_reason_fkey;
alter table public.institutional_actions add constraint institutional_actions_type_reason_fkey
  foreign key (action_type, reason_code)
  references public.institutional_action_reasons(action_type, code);

alter table public.institutional_actions drop constraint if exists institutional_actions_actor_membership_fkey;
alter table public.institutional_actions add constraint institutional_actions_actor_membership_fkey
  foreign key (membership_id, organization_id, actor_id)
  references public.partner_memberships(id, organization_id, user_id);

-- Preserve the exact QR-to-vehicle assignment used at action creation time.
alter table public.code_assignments
  add constraint code_assignments_id_code_vehicle_key unique (id, code_id, vehicle_id);

alter table public.institutional_actions
  add column if not exists code_assignment_id uuid;

update public.institutional_actions a
set code_assignment_id = (
  select x.id from public.code_assignments x
  where x.code_id=a.code_id and x.vehicle_id=a.vehicle_id and x.assigned_at<=a.created_at
  order by (x.ended_at is null) desc,x.assigned_at desc limit 1
)
where a.code_assignment_id is null;

alter table public.institutional_actions alter column code_assignment_id set not null;
alter table public.institutional_actions drop constraint if exists institutional_actions_assignment_fkey;
alter table public.institutional_actions add constraint institutional_actions_assignment_fkey
  foreign key (code_assignment_id, code_id, vehicle_id)
  references public.code_assignments(id, code_id, vehicle_id);

create index if not exists institutional_actions_assignment_idx
  on public.institutional_actions(code_assignment_id);

-- Invitation lifecycle is explicit, revocable, expiring and single-use.
alter table public.partner_invitations
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles(id);

alter table public.partner_invitations drop constraint if exists partner_invitations_revocation_pair;
alter table public.partner_invitations add constraint partner_invitations_revocation_pair
  check ((revoked_at is null) = (revoked_by is null));

create unique index if not exists partner_invitations_one_active_email_idx
  on public.partner_invitations(organization_id, lower(email))
  where claimed_at is null and revoked_at is null;

create or replace function private.has_org_permission(p_organization_id uuid,p_permission_code text,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.partner_memberships m
    join public.partner_organizations o on o.id=m.organization_id
    join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.active
    join public.organization_role_permissions rp on rp.role_id=r.id and rp.permission_code=p_permission_code
    join public.organization_entitlements e on e.organization_id=m.organization_id and e.permission_code=rp.permission_code and e.revoked_at is null
    join public.organization_permissions p on p.code=rp.permission_code and p.active
    where m.organization_id=p_organization_id and m.user_id=p_user_id and m.status='ACTIVE'
      and o.status='ACTIVE' and o.institutional_enabled and o.institutional_status='VERIFIED'
  )
$$;

create or replace function public.create_institutional_move_request(
  p_organization_id uuid,p_public_token text,p_reason_code text,p_reason_note text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := (select auth.uid());
  v_membership public.partner_memberships%rowtype;
  v_code uuid; v_assignment uuid; v_vehicle uuid; v_owner uuid;
  v_reason public.institutional_action_reasons%rowtype;
  v_action public.institutional_actions%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not private.has_org_permission(p_organization_id,'VEHICLE_MOVE_REQUEST',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into v_membership from public.partner_memberships
    where organization_id=p_organization_id and user_id=v_user and status='ACTIVE' for share;
  select * into v_reason from public.institutional_action_reasons
    where code=p_reason_code and action_type='VEHICLE_MOVE_REQUEST' and active;
  if v_reason.code is null then raise exception 'INVALID_REASON' using errcode='22023'; end if;
  if v_reason.requires_note and (nullif(trim(p_reason_note),'') is null or char_length(trim(p_reason_note)) not between 3 and 240)
    then raise exception 'REASON_NOTE_REQUIRED' using errcode='22023'; end if;
  if char_length(p_idempotency_key) not between 16 and 120 then raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode='22023'; end if;
  select c.id,a.id,a.vehicle_id,v.owner_id into v_code,v_assignment,v_vehicle,v_owner
  from public.codes c
  join public.code_assignments a on a.code_id=c.id and a.ended_at is null
  join public.vehicles v on v.id=a.vehicle_id and v.archived_at is null
  where c.public_token=p_public_token and c.activation_state='ACTIVE' for share;
  if v_code is null then raise exception 'CODE_NOT_ACTIVE' using errcode='P0002'; end if;
  select * into v_action from public.institutional_actions
    where membership_id=v_membership.id and idempotency_key=p_idempotency_key;
  if v_action.id is not null then
    return jsonb_build_object('id',v_action.id,'referenceNumber',v_action.reference_number,'status',v_action.status,'created',false);
  end if;
  if (select count(*) from public.institutional_actions where membership_id=v_membership.id and created_at>now()-interval '10 minutes')>=10
    then raise exception 'RATE_LIMITED' using errcode='P0001'; end if;
  if exists(select 1 from public.institutional_actions where organization_id=p_organization_id and code_assignment_id=v_assignment
    and action_type='VEHICLE_MOVE_REQUEST' and status in ('SENT','DELIVERED','ACKNOWLEDGED') and created_at>now()-interval '2 minutes')
    then raise exception 'DUPLICATE_ACTIVE_REQUEST' using errcode='P0001'; end if;
  insert into public.institutional_actions(
    reference_number,organization_id,membership_id,actor_id,code_id,code_assignment_id,vehicle_id,
    action_type,reason_code,reason_note,status,idempotency_key
  ) values(
    'DOR-MOVE-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.dorni_institutional_reference')::text,6,'0'),
    p_organization_id,v_membership.id,v_user,v_code,v_assignment,v_vehicle,'VEHICLE_MOVE_REQUEST',v_reason.code,
    nullif(trim(coalesce(p_reason_note,'')),''),'SENT',p_idempotency_key
  ) returning * into v_action;
  insert into public.institutional_action_events(action_id,event_type,actor_id,actor_kind,to_status,safe_metadata)
  values(v_action.id,'ACTION_CREATED',v_user,'ORGANIZATION_MEMBER','SENT',jsonb_build_object('reasonCode',v_reason.code,'correlationId',v_action.correlation_id));
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','INSTITUTIONAL_MOVE_REQUEST_CREATED','institutional_action',v_action.id,
    jsonb_build_object('organizationId',p_organization_id,'membershipId',v_membership.id,'codeAssignmentId',v_assignment,'reasonCode',v_reason.code,'correlationId',v_action.correlation_id));
  insert into public.notification_messages(institutional_action_id,recipient_id,channel,template_code)
  values(v_action.id,v_owner,'IN_APP','INSTITUTIONAL_MOVE_REQUEST');
  insert into public.notification_messages(institutional_action_id,recipient_id,channel,template_code)
  select v_action.id,v_owner,n.primary_channel,'INSTITUTIONAL_MOVE_REQUEST'
  from public.notification_preferences n where n.user_id=v_owner and n.primary_channel<>'IN_APP';
  return jsonb_build_object('id',v_action.id,'referenceNumber',v_action.reference_number,'status',v_action.status,'created',true);
end $$;

create or replace function public.org_invite_member(p_organization_id uuid,p_email text,p_role_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_inv public.partner_invitations%rowtype; v_legacy_role text;
begin
  if not private.has_org_permission(p_organization_id,'ORG_MEMBER_INVITE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or nullif(trim(p_email),'') is null then raise exception 'INVALID_INVITATION' using errcode='22023'; end if;
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
end $$;

create or replace function public.claim_partner_invitation(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_email text; v_inv public.partner_invitations%rowtype; v_org_name text; v_membership public.partner_memberships%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select lower(email) into v_email from auth.users where id=v_user;
  select * into v_inv from public.partner_invitations
    where token_hash=p_token_hash and claimed_at is null and revoked_at is null and expires_at>now() for update;
  if v_inv.id is null then raise exception 'INVITATION_INVALID' using errcode='P0002'; end if;
  if lower(v_inv.email)<>v_email then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='42501'; end if;
  if not exists(select 1 from public.partner_organizations where id=v_inv.organization_id and status='ACTIVE' and institutional_status='VERIFIED')
    then raise exception 'ORGANIZATION_NOT_ACTIVE' using errcode='42501'; end if;
  insert into public.partner_memberships(organization_id,user_id,role,role_id,status)
  values(v_inv.organization_id,v_user,v_inv.role,v_inv.role_id,'ACTIVE')
  on conflict (organization_id,user_id) do update set role=excluded.role,role_id=excluded.role_id,status='ACTIVE'
  returning * into v_membership;
  update public.partner_invitations set claimed_by=v_user,claimed_at=now() where id=v_inv.id;
  select name into v_org_name from public.partner_organizations where id=v_inv.organization_id;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','ORGANIZATION_MEMBER_ACTIVATED','partner_membership',v_membership.id,
    jsonb_build_object('organizationId',v_inv.organization_id,'invitationId',v_inv.id,'roleId',v_inv.role_id));
  return jsonb_build_object('organizationId',v_inv.organization_id,'organizationName',v_org_name,'membershipId',v_membership.id,'roleId',v_inv.role_id);
end $$;

create or replace function public.org_revoke_invitation(p_organization_id uuid,p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_inv public.partner_invitations%rowtype;
begin
  if not private.has_org_permission(p_organization_id,'ORG_MEMBER_INVITE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.partner_invitations set revoked_at=now(),revoked_by=v_user
    where id=p_invitation_id and organization_id=p_organization_id and claimed_at is null and revoked_at is null
    returning * into v_inv;
  if v_inv.id is null then raise exception 'INVITATION_NOT_ACTIVE' using errcode='P0002'; end if;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','ORGANIZATION_INVITATION_REVOKED','partner_invitation',v_inv.id,jsonb_build_object('organizationId',p_organization_id));
  return jsonb_build_object('id',v_inv.id,'status','REVOKED');
end $$;

create or replace function public.org_set_member_role(p_organization_id uuid,p_membership_id uuid,p_role_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := (select auth.uid()); v_member public.partner_memberships%rowtype;
  v_old_role public.organization_roles%rowtype; v_new_role public.organization_roles%rowtype; v_legacy_role text;
begin
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
end $$;

create or replace function public.org_set_member_status(p_organization_id uuid,p_membership_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_actor_membership uuid; v_member public.partner_memberships%rowtype; v_role_code text;
begin
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
end $$;

create or replace function public.complete_institutional_action(p_organization_id uuid,p_action_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_action public.institutional_actions%rowtype; v_old text;
begin
  if not private.has_org_permission(p_organization_id,'VEHICLE_MOVE_REQUEST',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into v_action from public.institutional_actions
    where id=p_action_id and organization_id=p_organization_id for update;
  if v_action.id is null then raise exception 'ACTION_NOT_FOUND' using errcode='P0002'; end if;
  if v_action.status<>'ACKNOWLEDGED' then raise exception 'ACTION_NOT_COMPLETABLE' using errcode='22023'; end if;
  v_old:=v_action.status;
  update public.institutional_actions set status='COMPLETED',completed_at=now(),updated_at=now()
    where id=p_action_id returning * into v_action;
  insert into public.institutional_action_events(action_id,event_type,actor_id,actor_kind,from_status,to_status)
  values(v_action.id,'ACTION_COMPLETED',v_user,'ORGANIZATION_MEMBER',v_old,'COMPLETED');
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','INSTITUTIONAL_ACTION_COMPLETED','institutional_action',v_action.id,jsonb_build_object('organizationId',p_organization_id));
  return jsonb_build_object('id',v_action.id,'status',v_action.status,'completedAt',v_action.completed_at);
end $$;

create or replace function public.get_organization_institutional_overview(
  p_organization_id uuid,p_from timestamptz default (now()-interval '30 days'),p_to timestamptz default now()
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_user uuid := (select auth.uid());
  v_can_actions boolean; v_can_members boolean; v_can_invite boolean;
  v_can_roles boolean; v_can_audit boolean; v_can_report boolean;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_from>=p_to or p_to-p_from>interval '366 days'
    then raise exception 'INVALID_PERIOD' using errcode='22023'; end if;
  v_can_actions:=private.has_org_permission(p_organization_id,'VEHICLE_MOVE_REQUEST',v_user);
  v_can_members:=private.has_org_permission(p_organization_id,'ORG_MEMBER_VIEW',v_user);
  v_can_invite:=private.has_org_permission(p_organization_id,'ORG_MEMBER_INVITE',v_user);
  v_can_roles:=private.has_org_permission(p_organization_id,'ORG_ROLE_ASSIGN',v_user);
  v_can_audit:=private.has_org_permission(p_organization_id,'ORG_AUDIT_VIEW',v_user);
  v_can_report:=private.has_org_permission(p_organization_id,'ORG_REPORT_VIEW',v_user);
  if not (v_can_actions or v_can_members or v_can_invite or v_can_roles or v_can_audit or v_can_report)
    then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return jsonb_build_object(
    'organization',(select jsonb_build_object(
      'id',o.id,'name',o.name,'status',o.status,'institutionalEnabled',o.institutional_enabled,
      'institutionalStatus',o.institutional_status
    ) from public.partner_organizations o where o.id=p_organization_id),
    'capabilities',jsonb_build_object(
      'actions',v_can_actions,'members',v_can_members,'invite',v_can_invite,
      'roles',v_can_roles,'audit',v_can_audit,'reports',v_can_report
    ),
    'actions',case when v_can_actions or v_can_report then coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'referenceNumber',a.reference_number,'actionType',a.action_type,'reasonCode',a.reason_code,
      'status',a.status,'ownerResponse',a.owner_response,'createdAt',a.created_at,'deliveredAt',a.delivered_at,
      'acknowledgedAt',a.acknowledged_at,'completedAt',a.completed_at
    ) order by a.created_at desc) from public.institutional_actions a
      where a.organization_id=p_organization_id and a.created_at>=p_from and a.created_at<p_to),'[]'::jsonb) else '[]'::jsonb end,
    'metrics',case when v_can_report or v_can_actions then (select jsonb_build_object(
      'total',count(*),'sent',count(*) filter(where status='SENT'),'delivered',count(*) filter(where status='DELIVERED'),
      'acknowledged',count(*) filter(where acknowledged_at is not null),'completed',count(*) filter(where status='COMPLETED'),
      'unacknowledged',count(*) filter(where acknowledged_at is null and status in ('SENT','DELIVERED'))
    ) from public.institutional_actions where organization_id=p_organization_id and created_at>=p_from and created_at<p_to) else '{}'::jsonb end,
    'members',case when v_can_members then coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'name',p.full_name,'email',p.email,'status',m.status,'roleId',m.role_id,'roleName',r.name_ar,
      'lastActivity',(select max(a.created_at) from public.institutional_actions a where a.membership_id=m.id),
      'actionCount',(select count(*) from public.institutional_actions a where a.membership_id=m.id and a.created_at>=p_from and a.created_at<p_to)
    ) order by m.created_at) from public.partner_memberships m join public.profiles p on p.id=m.user_id
      left join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id
      where m.organization_id=p_organization_id),'[]'::jsonb) else '[]'::jsonb end,
    'roles',case when v_can_roles or v_can_invite then coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'code',r.code,'name',r.name_ar,'systemRole',r.system_role,
      'permissions',coalesce((select jsonb_agg(rp.permission_code order by rp.permission_code) from public.organization_role_permissions rp where rp.role_id=r.id),'[]'::jsonb)
    ) order by r.created_at) from public.organization_roles r where r.organization_id=p_organization_id and r.active),'[]'::jsonb) else '[]'::jsonb end,
    'entitlements',case when v_can_roles then coalesce((select jsonb_agg(e.permission_code order by e.permission_code)
      from public.organization_entitlements e where e.organization_id=p_organization_id and e.revoked_at is null),'[]'::jsonb) else '[]'::jsonb end,
    'invitations',case when v_can_invite then coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'roleId',i.role_id,'roleName',r.name_ar,'createdAt',i.created_at,'expiresAt',i.expires_at,
      'status',case when i.claimed_at is not null then 'CLAIMED' when i.revoked_at is not null then 'REVOKED' when i.expires_at<=now() then 'EXPIRED' else 'PENDING' end
    ) order by i.created_at desc) from public.partner_invitations i
      left join public.organization_roles r on r.id=i.role_id and r.organization_id=i.organization_id
      where i.organization_id=p_organization_id and i.created_at>=p_from),'[]'::jsonb) else '[]'::jsonb end,
    'audit',case when v_can_audit then coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'action',l.action,'entityType',l.entity_type,'entityId',l.entity_id,'createdAt',l.created_at
    ) order by l.created_at desc) from (select * from public.audit_logs
      where safe_metadata->>'organizationId'=p_organization_id::text and created_at>=p_from and created_at<p_to
      order by created_at desc limit 100) l),'[]'::jsonb) else '[]'::jsonb end
  );
end $$;

create or replace function public.admin_set_institutional_access(p_organization_id uuid,p_enabled boolean,p_entitlements text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_permission text; v_org public.partner_organizations%rowtype;
begin
  if not private.is_dorni_super_admin(v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if exists(select 1 from unnest(coalesce(p_entitlements,'{}'::text[])) x where not exists(select 1 from public.organization_permissions p where p.code=x and p.active))
    then raise exception 'INVALID_PERMISSION' using errcode='22023'; end if;
  if p_enabled and not exists(select 1 from public.partner_organizations where id=p_organization_id and status='ACTIVE')
    then raise exception 'ORGANIZATION_NOT_ACTIVE' using errcode='22023'; end if;
  update public.partner_organizations set
    institutional_enabled=p_enabled,
    institutional_status=case when p_enabled then 'VERIFIED' else 'NOT_VERIFIED' end,
    institutional_enabled_at=case when p_enabled then now() else null end,
    institutional_enabled_by=case when p_enabled then v_user else null end,
    updated_at=now()
  where id=p_organization_id returning * into v_org;
  if v_org.id is null then raise exception 'ORGANIZATION_NOT_FOUND' using errcode='P0002'; end if;
  for v_permission in select code from public.organization_permissions loop
    if p_enabled and v_permission=any(coalesce(p_entitlements,'{}'::text[])) then
      insert into public.organization_entitlements(organization_id,permission_code,granted_by)
      values(p_organization_id,v_permission,v_user)
      on conflict (organization_id,permission_code) do update set granted_by=v_user,granted_at=now(),revoked_by=null,revoked_at=null;
      insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
      values(v_user,'ADMIN','ORGANIZATION_ENTITLEMENT_GRANTED','partner_organization',p_organization_id,jsonb_build_object('permissionCode',v_permission));
    else
      update public.organization_entitlements set revoked_by=v_user,revoked_at=now()
      where organization_id=p_organization_id and permission_code=v_permission and revoked_at is null;
      if found then insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
        values(v_user,'ADMIN','ORGANIZATION_ENTITLEMENT_REVOKED','partner_organization',p_organization_id,jsonb_build_object('permissionCode',v_permission)); end if;
    end if;
  end loop;
  delete from public.organization_role_permissions rp using public.organization_roles r
  where rp.role_id=r.id and r.organization_id=p_organization_id and r.code='PARTNER_ADMIN';
  insert into public.organization_role_permissions(role_id,permission_code,assigned_by)
  select r.id,e.permission_code,v_user from public.organization_roles r
  join public.organization_entitlements e on e.organization_id=r.organization_id and e.revoked_at is null
  where r.organization_id=p_organization_id and r.code='PARTNER_ADMIN' on conflict do nothing;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'ADMIN',case when p_enabled then 'INSTITUTIONAL_ACCESS_ENABLED' else 'INSTITUTIONAL_ACCESS_DISABLED' end,
    'partner_organization',p_organization_id,jsonb_build_object('entitlements',coalesce(p_entitlements,'{}'::text[]),'institutionalStatus',v_org.institutional_status));
  return jsonb_build_object('organizationId',p_organization_id,'enabled',p_enabled,'status',v_org.institutional_status,'entitlements',coalesce(p_entitlements,'{}'::text[]));
end $$;

revoke all on function public.org_revoke_invitation(uuid,uuid),public.org_set_member_role(uuid,uuid,uuid),public.complete_institutional_action(uuid,uuid) from public,anon,authenticated;
grant execute on function public.org_revoke_invitation(uuid,uuid),public.org_set_member_role(uuid,uuid,uuid),public.complete_institutional_action(uuid,uuid) to authenticated;

commit;

