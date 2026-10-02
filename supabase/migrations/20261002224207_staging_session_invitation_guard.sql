begin;
-- Staging security verification: revoked sessions must not retain privileged RPC access.
CREATE OR REPLACE FUNCTION public.admin_set_institutional_access(p_organization_id uuid, p_enabled boolean, p_entitlements text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_permission text; v_org public.partner_organizations%rowtype;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_set_partner_status(p_organization_id uuid, p_status text, p_trusted_generation boolean DEFAULT false, p_generation_limit integer DEFAULT 100, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=private.commercial_user(); org public.partner_organizations%rowtype;
begin
 if not private.support_allowed('view') or not exists(select 1 from public.internal_memberships where user_id=u and active and role_code='SUPER_ADMIN') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_status is null or p_status not in ('ACTIVE','SUSPENDED','REJECTED') then raise exception 'INVALID_STATUS' using errcode='22023';end if;
 if p_generation_limit is null or p_generation_limit<1 or p_generation_limit>100000 then raise exception 'INVALID_LIMIT' using errcode='22023';end if;
 if p_trusted_generation is null or char_length(p_note)>1000 then raise exception 'INVALID_INPUT' using errcode='22023';end if;
 update public.partner_organizations set status=p_status,trusted_generation=case when p_status='ACTIVE' then p_trusted_generation else false end,generation_limit_per_day=p_generation_limit,reviewed_at=now(),reviewed_by=u,review_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now() where id=p_organization_id returning * into org;
 if org.id is null then raise exception 'PARTNER_NOT_FOUND' using errcode='P0002';end if;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(u,'ADMIN','PARTNER_STATUS_CHANGED','partner_organization',org.id,jsonb_build_object('status',p_status,'trustedGeneration',org.trusted_generation,'generationLimitPerDay',org.generation_limit_per_day));
 return to_jsonb(org);
end $function$
;
CREATE OR REPLACE FUNCTION public.claim_dorni_code(p_serial_number text, p_credential_hash text, p_vehicle_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := private.commercial_user();
  v_code public.codes%rowtype;
  v_claim public.code_claims%rowtype;
  v_assignment uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  -- Serialize claims by this account, including claims for the same vehicle.
  perform 1 from public.profiles where id=v_user and account_status='ACTIVE' for update;
  if not found then raise exception 'ACCOUNT_NOT_ACTIVE' using errcode='42501'; end if;
  perform 1 from public.vehicles where id=p_vehicle_id and owner_id=v_user and archived_at is null for update;
  if not found then return null; end if;
  select * into v_code from public.codes where serial_number=upper(trim(p_serial_number)) for update;
  if not found then return null; end if;
  select * into v_claim from public.code_claims where code_id=v_code.id for update;
  if not found then return null; end if;
  if v_claim.locked_until > clock_timestamp() then return null; end if;
  if p_credential_hash is null or p_credential_hash !~ '^[0-9a-f]{64}$'
     or v_claim.credential_hash is null or v_claim.credential_hash is distinct from p_credential_hash then
    update public.code_claims set
      failed_attempts=case when locked_until is not null then 1 else least(failed_attempts,5)+1 end,
      locked_until=case when locked_until is null and failed_attempts+1>=5
        then clock_timestamp()+interval '30 minutes' else null end
    where id=v_claim.id;
    return null;
  end if;
  -- Successful network retries are safe, but never transfer ownership.
  if v_claim.claimed_at is not null then
    select id into v_assignment from public.code_assignments
    where code_id=v_code.id and vehicle_id=p_vehicle_id and assigned_by=v_user and ended_at is null
      and v_claim.claimed_by=v_user;
    return v_assignment;
  end if;
  if v_code.ownership_state<>'UNCLAIMED' or v_code.activation_state<>'INACTIVE' then return null; end if;
  if exists(select 1 from public.code_assignments where vehicle_id=p_vehicle_id and ended_at is null) then return null; end if;
  update public.code_claims set claimed_by=v_user,claimed_at=now(),failed_attempts=0,locked_until=null where id=v_claim.id;
  update public.codes set ownership_state='CLAIMED',activation_state='ACTIVE' where id=v_code.id;
  insert into public.code_assignments(code_id,vehicle_id,assigned_by)
    values(v_code.id,p_vehicle_id,v_user) returning id into v_assignment;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id)
    values(v_user,'OWNER','CODE_CLAIMED','code',v_code.id);
  return v_assignment;
end $function$
;
CREATE OR REPLACE FUNCTION public.claim_partner_invitation(p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_email text; v_inv public.partner_invitations%rowtype; v_org_name text; v_membership public.partner_memberships%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select lower(email) into v_email from auth.users where id=v_user and email_confirmed_at is not null;
  if v_email is null then raise exception 'EMAIL_NOT_CONFIRMED' using errcode='42501'; end if;
  select * into v_inv from public.partner_invitations
    where token_hash=p_token_hash and claimed_at is null and revoked_at is null and expires_at>now() for update;
  if v_inv.id is null then raise exception 'INVITATION_INVALID' using errcode='P0002'; end if;
  if lower(v_inv.email) is distinct from v_email then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='42501'; end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.complete_institutional_action(p_organization_id uuid, p_action_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_action public.institutional_actions%rowtype; v_old text;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.create_institutional_move_request(p_organization_id uuid, p_public_token text, p_reason_code text, p_reason_note text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select private.commercial_user());
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
  where c.public_token=p_public_token and private.code_service_available(c.id) for share;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.get_admin_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_role text; v_result jsonb;
begin
  select role_code into v_role from public.internal_memberships where user_id=v_user and active;
  if v_role is distinct from 'SUPER_ADMIN' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select jsonb_build_object(
    'role',v_role,
    'metrics',jsonb_build_object(
      'users',(select count(*) from public.profiles),
      'vehicles',(select count(*) from public.vehicles),
      'codes',(select count(*) from public.codes),
      'reports',(select count(*) from public.reports),
      'activeReports',(select count(*) from public.reports where status='ACTIVE'),
      'partners',(select count(*) from public.partner_organizations),
      'pendingPartners',(select count(*) from public.partner_organizations where status='PENDING'),
      'pendingBatchRequests',(select count(*) from public.partner_batch_requests where status='PENDING'),
      'support',(select count(*) from public.support_tickets where status in ('OPEN','IN_PROGRESS')),
      'batches',(select count(*) from public.code_batches),
      'failedNotifications',(select count(*) from public.notification_messages where status='FAILED')
    ),
    'organizations',coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select o.id,o.name,o.type,o.status,o.trusted_generation,o.registration_number,
          o.generation_limit_per_day,o.reviewed_at,o.review_note,o.created_at,
          a.user_id as admin_user_id,a.full_name as admin_name,a.email as admin_email
        from public.partner_organizations o
        left join lateral (
          select p.id as user_id,p.full_name,p.email
          from public.partner_memberships m
          join public.profiles p on p.id=m.user_id
          where m.organization_id=o.id and m.role='PARTNER_ADMIN'
          order by m.created_at limit 1
        ) a on true
        order by o.created_at desc limit 100
      ) x
    ),'[]'::jsonb),
    'batchRequests',coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select r.id,r.quantity,r.product_type,r.status,r.notes,r.review_note,r.created_at,r.reviewed_at,
          o.id as organization_id,o.name as organization_name
        from public.partner_batch_requests r
        join public.partner_organizations o on o.id=r.organization_id
        order by r.created_at desc limit 100
      ) x
    ),'[]'::jsonb),
    'recentBatches',coalesce((select jsonb_agg(x) from (select id,batch_code,quantity,generated_count,generation_status,production_status,distribution_status,organization_id,created_at from public.code_batches order by created_at desc limit 30)x),'[]'::jsonb),
    'recentReports',coalesce((select jsonb_agg(x) from (select id,report_type_code,status,duplicate_count,created_at from public.reports order by created_at desc limit 30)x),'[]'::jsonb),
    'supportTickets',coalesce((select jsonb_agg(x) from (select id,subject,category,status,created_at from public.support_tickets order by created_at desc limit 30)x),'[]'::jsonb),
    'auditLogs',coalesce((select jsonb_agg(x) from (select id,actor_kind,action,entity_type,entity_id,safe_metadata,created_at from public.audit_logs order by created_at desc limit 50)x),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $function$
;
CREATE OR REPLACE FUNCTION public.get_enterprise_console(p_organization_id uuid, p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user()); v_admin boolean; v_manage_structure boolean; v_manage_operations boolean; v_manage_scope boolean; v_manage_policy boolean; v_manage_inventory boolean;
begin
 if not private.is_active_org_member(p_organization_id,v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_from>=p_to or p_to-p_from>interval '366 days' then raise exception 'INVALID_PERIOD' using errcode='22023'; end if;
 v_admin:=private.is_org_admin(p_organization_id,v_user);
 v_manage_structure:=v_admin or private.has_org_permission(p_organization_id,'ORG_STRUCTURE_MANAGE',v_user);
 v_manage_operations:=v_admin or private.has_org_permission(p_organization_id,'ORG_OPERATION_MANAGE',v_user);
 v_manage_scope:=v_admin or private.has_org_permission(p_organization_id,'ORG_SCOPE_ASSIGN',v_user);
 v_manage_policy:=v_admin or private.has_org_permission(p_organization_id,'ORG_POLICY_MANAGE',v_user);
 v_manage_inventory:=v_admin or private.has_org_permission(p_organization_id,'ORG_INVENTORY_MANAGE',v_user);
 return jsonb_build_object(
  'capabilities',jsonb_build_object('structure',v_manage_structure,'operations',v_manage_operations,'scopes',v_manage_scope,'policy',v_manage_policy,'inventory',v_manage_inventory,'admin',v_admin),
  'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'type',s.site_type,'address',s.address_text,'status',s.status,'primary',s.is_primary,'memberCount',(select count(*) from public.organization_member_scopes ms where ms.site_id=s.id and ms.ended_at is null),'openCases',(select count(*) from public.institutional_actions a where a.site_id=s.id and a.status not in ('COMPLETED','CANCELLED','EXPIRED'))) order by s.is_primary desc,s.name) from public.organization_sites s where s.organization_id=p_organization_id),'[]'::jsonb),
  'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'siteId',u.site_id,'parentId',u.parent_unit_id,'code',u.code,'name',u.name,'type',u.unit_type,'costCenter',u.cost_center,'status',u.status,'memberCount',(select count(*) from public.organization_member_scopes ms where ms.unit_id=u.id and ms.ended_at is null),'openCases',(select count(*) from public.institutional_actions a where a.unit_id=u.id and a.status not in ('COMPLETED','CANCELLED','EXPIRED'))) order by u.name) from public.organization_units u where u.organization_id=p_organization_id),'[]'::jsonb),
  'scopes',coalesce((select jsonb_agg(jsonb_build_object('id',ms.id,'membershipId',ms.membership_id,'siteId',ms.site_id,'unitId',ms.unit_id,'role',ms.scope_role,'primary',ms.is_primary) order by ms.assigned_at) from public.organization_member_scopes ms where ms.organization_id=p_organization_id and ms.ended_at is null),'[]'::jsonb),
  'policies',coalesce((select jsonb_agg(jsonb_build_object('priority',p.priority,'acknowledgementMinutes',p.acknowledgement_minutes,'resolutionMinutes',p.resolution_minutes,'escalationMinutes',p.escalation_minutes) order by array_position(array['CRITICAL','HIGH','NORMAL','LOW'],p.priority)) from public.organization_sla_policies p where p.organization_id=p_organization_id),'[]'::jsonb),
  'operations',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'referenceNumber',a.reference_number,'status',a.status,'priority',a.priority,'reasonCode',a.reason_code,'siteId',a.site_id,'unitId',a.unit_id,'assignedMembershipId',a.assigned_membership_id,'assigneeName',pp.full_name,'createdAt',a.created_at,'updatedAt',a.updated_at,'slaDueAt',a.sla_due_at,'overdue',(a.status not in ('COMPLETED','CANCELLED','EXPIRED') and a.sla_due_at<now()),'note',a.operational_note) order by (a.status not in ('COMPLETED','CANCELLED','EXPIRED') and a.sla_due_at<now()) desc,array_position(array['CRITICAL','HIGH','NORMAL','LOW'],a.priority),a.created_at desc) from public.institutional_actions a left join public.partner_memberships pm on pm.id=a.assigned_membership_id left join public.profiles pp on pp.id=pm.user_id where a.organization_id=p_organization_id and a.created_at>=p_from and a.created_at<p_to),'[]'::jsonb),
  'metrics',(select jsonb_build_object('total',count(*),'open',count(*) filter(where status not in ('COMPLETED','CANCELLED','EXPIRED')),'overdue',count(*) filter(where status not in ('COMPLETED','CANCELLED','EXPIRED') and sla_due_at<now()),'critical',count(*) filter(where priority='CRITICAL' and status not in ('COMPLETED','CANCELLED','EXPIRED')),'unassigned',count(*) filter(where assigned_membership_id is null and status not in ('COMPLETED','CANCELLED','EXPIRED')),'slaCompliance',case when count(*) filter(where status='COMPLETED')=0 then 100 else round(100.0*count(*) filter(where status='COMPLETED' and completed_at<=sla_due_at)/count(*) filter(where status='COMPLETED'),1) end) from public.institutional_actions where organization_id=p_organization_id and created_at>=p_from and created_at<p_to),
  'workforce',coalesce((select jsonb_agg(jsonb_build_object('membershipId',m.id,'name',coalesce(p.full_name,p.email),'status',m.status,'roleName',r.name_ar,'openCases',(select count(*) from public.institutional_actions a where a.assigned_membership_id=m.id and a.status not in ('COMPLETED','CANCELLED','EXPIRED')),'overdueCases',(select count(*) from public.institutional_actions a where a.assigned_membership_id=m.id and a.status not in ('COMPLETED','CANCELLED','EXPIRED') and a.sla_due_at<now())) order by p.full_name,p.email) from public.partner_memberships m join public.profiles p on p.id=m.user_id left join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id where m.organization_id=p_organization_id),'[]'::jsonb),
  'inventory',coalesce((select jsonb_agg(jsonb_build_object('batchId',b.id,'batchCode',b.batch_code,'quantity',b.quantity,'generated',b.generated_count,'allocated',coalesce((select sum(x.quantity) from public.organization_inventory_allocations x where x.batch_id=b.id and x.status='ALLOCATED'),0),'claimed',(select count(*) from public.codes c where c.batch_id=b.id and c.ownership_state='CLAIMED')) order by b.created_at desc) from public.code_batches b where b.organization_id=p_organization_id),'[]'::jsonb)
 );
end $function$
;
CREATE OR REPLACE FUNCTION public.get_institutional_scan_context(p_public_token text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_org uuid; v_code uuid; v_manufacturer text; v_model text; v_color text; v_org_count integer; v_actions jsonb; v_orgs jsonb;
begin
  if v_user is null then return jsonb_build_object('authenticated',false,'availableActions','[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name)),'[]'::jsonb),count(*)
    into v_orgs,v_org_count
  from public.partner_memberships m join public.partner_organizations o on o.id=m.organization_id
  where m.user_id=v_user and m.status='ACTIVE' and o.status='ACTIVE' and o.institutional_enabled;
  if p_organization_id is null and v_org_count=1 then select (v_orgs->0->>'id')::uuid into v_org;
  else v_org:=p_organization_id; end if;
  if v_org is null or not private.is_active_org_member(v_org,v_user) then
    return jsonb_build_object('authenticated',true,'organizations',v_orgs,'selectedOrganizationId',null,'availableActions','[]'::jsonb);
  end if;
  select c.id,v.manufacturer,v.model,v.color into v_code,v_manufacturer,v_model,v_color
  from public.codes c join public.code_assignments a on a.code_id=c.id and a.ended_at is null
  join public.vehicles v on v.id=a.vehicle_id and v.archived_at is null
  where c.public_token=p_public_token and private.code_service_available(c.id) limit 1;
  if v_code is null then raise exception 'CODE_NOT_ACTIVE' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'label',t.label_ar,'reasons',(
    select coalesce(jsonb_agg(jsonb_build_object('code',r.code,'label',r.label_ar,'requiresNote',r.requires_note) order by r.display_order),'[]'::jsonb)
    from public.institutional_action_reasons r where r.action_type=t.code and r.active
  ))),'[]'::jsonb) into v_actions
  from public.institutional_action_types t
  where t.active and private.has_org_permission(v_org,t.required_permission,v_user);
  return jsonb_build_object('authenticated',true,'organizations',v_orgs,'selectedOrganizationId',v_org,
    'vehicle',jsonb_build_object('manufacturer',v_manufacturer,'model',v_model,'color',v_color),
    'availableActions',v_actions);
end $function$
;
CREATE OR REPLACE FUNCTION public.get_my_account_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_internal text; v_memberships jsonb;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select role_code into v_internal from public.internal_memberships where user_id=v_user and active limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'membershipId',m.id,'organizationId',o.id,'organizationName',o.name,'organizationType',o.type,
    'organizationStatus',o.status,'institutionalEnabled',o.institutional_enabled,'legacyRole',m.role,'roleId',m.role_id
  ) order by m.created_at),'[]'::jsonb) into v_memberships
  from public.partner_memberships m join public.partner_organizations o on o.id=m.organization_id
  where m.user_id=v_user and m.status='ACTIVE';
  return jsonb_build_object(
    'internalRole',v_internal,'memberships',v_memberships,
    'destination',case when v_internal='SUPPORT' then '/support' when v_internal is not null then '/admin' when jsonb_array_length(v_memberships)>0 then '/partner' else '/app' end
  );
end $function$
;
CREATE OR REPLACE FUNCTION public.get_my_internal_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select role_code from public.internal_memberships where user_id=(select private.commercial_user()) and active
$function$
;
CREATE OR REPLACE FUNCTION public.get_organization_institutional_overview(p_organization_id uuid, p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select private.commercial_user());
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
end $function$
;
CREATE OR REPLACE FUNCTION public.get_owner_institutional_actions()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'referenceNumber',a.reference_number,'actionType',a.action_type,'reasonCode',a.reason_code,
    'status',a.status,'ownerResponse',a.owner_response,'createdAt',a.created_at,'acknowledgedAt',a.acknowledged_at,
    'organization',jsonb_build_object('name',o.name,'verified',o.institutional_enabled),
    'vehicle',jsonb_build_object('manufacturer',v.manufacturer,'model',v.model,'color',v.color)
  ) order by a.created_at desc),'[]'::jsonb)
  from public.institutional_actions a join public.vehicles v on v.id=a.vehicle_id
  join public.partner_organizations o on o.id=a.organization_id
  where v.owner_id=(select private.commercial_user())
$function$
;
CREATE OR REPLACE FUNCTION public.org_allocate_inventory(p_organization_id uuid, p_batch_id uuid, p_site_id uuid, p_unit_id uuid, p_custodian_membership_id uuid, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user()); v_batch public.code_batches%rowtype; v_allocated integer; v_allocation public.organization_inventory_allocations%rowtype;
begin
 if not private.is_org_admin(p_organization_id,v_user) and not private.has_org_permission(p_organization_id,'ORG_INVENTORY_MANAGE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_quantity<=0 or (p_site_id is null and p_unit_id is null) then raise exception 'INVALID_ALLOCATION' using errcode='22023'; end if;
 if p_site_id is not null and p_unit_id is not null and not exists(select 1 from public.organization_units where id=p_unit_id and organization_id=p_organization_id and site_id=p_site_id) then raise exception 'UNIT_SITE_MISMATCH' using errcode='23514'; end if;
 select * into v_batch from public.code_batches where id=p_batch_id and organization_id=p_organization_id for update;
 if v_batch.id is null then raise exception 'BATCH_NOT_FOUND' using errcode='P0002'; end if;
 select coalesce(sum(quantity),0) into v_allocated from public.organization_inventory_allocations where batch_id=p_batch_id and status='ALLOCATED';
 if v_allocated+p_quantity>v_batch.generated_count then raise exception 'INSUFFICIENT_INVENTORY' using errcode='23514'; end if;
 insert into public.organization_inventory_allocations(organization_id,batch_id,site_id,unit_id,custodian_membership_id,quantity,allocated_by)
 values(p_organization_id,p_batch_id,p_site_id,p_unit_id,p_custodian_membership_id,p_quantity,v_user) returning * into v_allocation;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(v_user,'PARTNER','ORGANIZATION_INVENTORY_ALLOCATED','organization_inventory_allocation',v_allocation.id,jsonb_build_object('organizationId',p_organization_id,'batchId',p_batch_id,'quantity',p_quantity));
 return jsonb_build_object('id',v_allocation.id,'quantity',v_allocation.quantity,'allocatedAt',v_allocation.allocated_at);
end $function$
;
CREATE OR REPLACE FUNCTION public.org_assign_member_scope(p_organization_id uuid, p_membership_id uuid, p_site_id uuid, p_unit_id uuid, p_scope_role text, p_is_primary boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user()); v_scope public.organization_member_scopes%rowtype;
begin
 if not private.is_org_admin(p_organization_id,v_user) and not private.has_org_permission(p_organization_id,'ORG_SCOPE_ASSIGN',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_site_id is not null and p_unit_id is not null and not exists(select 1 from public.organization_units where id=p_unit_id and organization_id=p_organization_id and site_id=p_site_id) then raise exception 'UNIT_SITE_MISMATCH' using errcode='23514'; end if;
 if p_is_primary then update public.organization_member_scopes set is_primary=false where membership_id=p_membership_id and ended_at is null; end if;
 insert into public.organization_member_scopes(organization_id,membership_id,site_id,unit_id,scope_role,is_primary,assigned_by)
 values(p_organization_id,p_membership_id,p_site_id,p_unit_id,p_scope_role,p_is_primary,v_user) returning * into v_scope;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(v_user,'PARTNER','ORGANIZATION_MEMBER_SCOPE_ASSIGNED','organization_member_scope',v_scope.id,jsonb_build_object('organizationId',p_organization_id,'membershipId',p_membership_id));
 return to_jsonb(v_scope)-'assigned_by';
end $function$
;
CREATE OR REPLACE FUNCTION public.org_invite_member(p_organization_id uuid, p_email text, p_role_id uuid, p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_inv public.partner_invitations%rowtype; v_legacy_role text;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.org_manage_operation(p_organization_id uuid, p_action_id uuid, p_assigned_membership_id uuid, p_priority text, p_site_id uuid, p_unit_id uuid, p_note text, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user()); v_action public.institutional_actions%rowtype; v_minutes integer;
begin
 if not private.is_org_admin(p_organization_id,v_user) and not private.has_org_permission(p_organization_id,'ORG_OPERATION_MANAGE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_site_id is not null and p_unit_id is not null and not exists(select 1 from public.organization_units where id=p_unit_id and organization_id=p_organization_id and site_id=p_site_id) then raise exception 'UNIT_SITE_MISMATCH' using errcode='23514'; end if;
 select resolution_minutes into v_minutes from public.organization_sla_policies where organization_id=p_organization_id and priority=p_priority;
 update public.institutional_actions set assigned_membership_id=p_assigned_membership_id,assigned_at=case when assigned_membership_id is distinct from p_assigned_membership_id then now() else assigned_at end,
  priority=p_priority,site_id=p_site_id,unit_id=p_unit_id,operational_note=nullif(trim(p_note),''),sla_due_at=created_at+make_interval(mins=>coalesce(v_minutes,480)),updated_at=now()
 where id=p_action_id and organization_id=p_organization_id and updated_at=p_expected_updated_at returning * into v_action;
 if v_action.id is null then raise exception 'ACTION_CONFLICT' using errcode='40001'; end if;
 insert into public.institutional_action_events(action_id,event_type,actor_id,actor_kind,safe_metadata) values(v_action.id,'OPERATION_ASSIGNED',v_user,'ORGANIZATION_MEMBER',jsonb_build_object('assigneeMembershipId',p_assigned_membership_id,'priority',p_priority,'siteId',p_site_id,'unitId',p_unit_id));
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(v_user,'PARTNER','INSTITUTIONAL_OPERATION_MANAGED','institutional_action',v_action.id,jsonb_build_object('organizationId',p_organization_id));
 return jsonb_build_object('id',v_action.id,'updatedAt',v_action.updated_at,'slaDueAt',v_action.sla_due_at);
end $function$
;
CREATE OR REPLACE FUNCTION public.org_revoke_invitation(p_organization_id uuid, p_invitation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_inv public.partner_invitations%rowtype;
begin
  if not private.has_org_permission(p_organization_id,'ORG_MEMBER_INVITE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.partner_invitations set revoked_at=now(),revoked_by=v_user
    where id=p_invitation_id and organization_id=p_organization_id and claimed_at is null and revoked_at is null
    returning * into v_inv;
  if v_inv.id is null then raise exception 'INVITATION_NOT_ACTIVE' using errcode='P0002'; end if;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','ORGANIZATION_INVITATION_REVOKED','partner_invitation',v_inv.id,jsonb_build_object('organizationId',p_organization_id));
  return jsonb_build_object('id',v_inv.id,'status','REVOKED');
end $function$
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
CREATE OR REPLACE FUNCTION public.org_set_sla_policy(p_organization_id uuid, p_priority text, p_acknowledgement_minutes integer, p_resolution_minutes integer, p_escalation_minutes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user());
begin
 if not private.is_org_admin(p_organization_id,v_user) and not private.has_org_permission(p_organization_id,'ORG_POLICY_MANAGE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 insert into public.organization_sla_policies(organization_id,priority,acknowledgement_minutes,resolution_minutes,escalation_minutes,updated_by)
 values(p_organization_id,p_priority,p_acknowledgement_minutes,p_resolution_minutes,p_escalation_minutes,v_user)
 on conflict(organization_id,priority) do update set acknowledgement_minutes=excluded.acknowledgement_minutes,resolution_minutes=excluded.resolution_minutes,escalation_minutes=excluded.escalation_minutes,updated_by=v_user,updated_at=now();
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(v_user,'PARTNER','ORGANIZATION_SLA_POLICY_UPDATED','partner_organization',p_organization_id,jsonb_build_object('organizationId',p_organization_id,'priority',p_priority));
 return jsonb_build_object('priority',p_priority,'acknowledgementMinutes',p_acknowledgement_minutes,'resolutionMinutes',p_resolution_minutes,'escalationMinutes',p_escalation_minutes);
end $function$
;
CREATE OR REPLACE FUNCTION public.org_upsert_role(p_organization_id uuid, p_role_id uuid, p_code text, p_name_ar text, p_permissions text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_role public.organization_roles%rowtype; v_permission text;
begin
  if not private.has_org_permission(p_organization_id,'ORG_ROLE_ASSIGN',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_code !~ '^[A-Z][A-Z0-9_]{2,60}$' or char_length(trim(p_name_ar)) not between 2 and 100 then raise exception 'INVALID_ROLE' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_permissions) x where not exists(select 1 from public.organization_entitlements e where e.organization_id=p_organization_id and e.permission_code=x and e.revoked_at is null)) then raise exception 'PERMISSION_NOT_ENTITLED' using errcode='42501'; end if;
  if p_role_id is null then
    insert into public.organization_roles(organization_id,code,name_ar,created_by) values(p_organization_id,p_code,trim(p_name_ar),v_user) returning * into v_role;
  else
    update public.organization_roles set code=p_code,name_ar=trim(p_name_ar),updated_at=now() where id=p_role_id and organization_id=p_organization_id and not system_role returning * into v_role;
    if v_role.id is null then raise exception 'ROLE_NOT_EDITABLE' using errcode='42501'; end if;
  end if;
  delete from public.organization_role_permissions where role_id=v_role.id;
  foreach v_permission in array p_permissions loop
    insert into public.organization_role_permissions(role_id,permission_code,assigned_by) values(v_role.id,v_permission,v_user);
  end loop;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','ORGANIZATION_ROLE_UPSERTED','organization_role',v_role.id,jsonb_build_object('organizationId',p_organization_id,'permissions',p_permissions));
  return jsonb_build_object('id',v_role.id,'code',v_role.code,'name',v_role.name_ar,'permissions',p_permissions);
end $function$
;
CREATE OR REPLACE FUNCTION public.org_upsert_site(p_organization_id uuid, p_site_id uuid, p_code text, p_name text, p_site_type text, p_address text, p_status text, p_is_primary boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user()); v_site public.organization_sites%rowtype;
begin
 if not private.is_org_admin(p_organization_id,v_user) and not private.has_org_permission(p_organization_id,'ORG_STRUCTURE_MANAGE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_is_primary then update public.organization_sites set is_primary=false,updated_at=now() where organization_id=p_organization_id and is_primary; end if;
 if p_site_id is null then
  insert into public.organization_sites(organization_id,code,name,site_type,address_text,status,is_primary,created_by)
  values(p_organization_id,upper(trim(p_code)),trim(p_name),p_site_type,nullif(trim(p_address),''),p_status,p_is_primary,v_user) returning * into v_site;
 else
  update public.organization_sites set code=upper(trim(p_code)),name=trim(p_name),site_type=p_site_type,address_text=nullif(trim(p_address),''),status=p_status,is_primary=p_is_primary,updated_at=now()
  where id=p_site_id and organization_id=p_organization_id returning * into v_site;
 end if;
 if v_site.id is null then raise exception 'SITE_NOT_FOUND' using errcode='P0002'; end if;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(v_user,'PARTNER','ORGANIZATION_SITE_UPSERTED','organization_site',v_site.id,jsonb_build_object('organizationId',p_organization_id));
 return to_jsonb(v_site)-'created_by';
end $function$
;
CREATE OR REPLACE FUNCTION public.org_upsert_unit(p_organization_id uuid, p_unit_id uuid, p_site_id uuid, p_parent_unit_id uuid, p_code text, p_name text, p_unit_type text, p_cost_center text, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user()); v_unit public.organization_units%rowtype;
begin
 if not private.is_org_admin(p_organization_id,v_user) and not private.has_org_permission(p_organization_id,'ORG_STRUCTURE_MANAGE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_parent_unit_id is not null and not exists(select 1 from public.organization_units where id=p_parent_unit_id and organization_id=p_organization_id and site_id is not distinct from p_site_id) then raise exception 'PARENT_SCOPE_MISMATCH' using errcode='23514'; end if;
 if p_unit_id is null then
  insert into public.organization_units(organization_id,site_id,parent_unit_id,code,name,unit_type,cost_center,status,created_by)
  values(p_organization_id,p_site_id,p_parent_unit_id,upper(trim(p_code)),trim(p_name),p_unit_type,nullif(trim(p_cost_center),''),p_status,v_user) returning * into v_unit;
 else
  update public.organization_units set site_id=p_site_id,parent_unit_id=p_parent_unit_id,code=upper(trim(p_code)),name=trim(p_name),unit_type=p_unit_type,cost_center=nullif(trim(p_cost_center),''),status=p_status,updated_at=now()
  where id=p_unit_id and organization_id=p_organization_id returning * into v_unit;
 end if;
 if v_unit.id is null then raise exception 'UNIT_NOT_FOUND' using errcode='P0002'; end if;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(v_user,'PARTNER','ORGANIZATION_UNIT_UPSERTED','organization_unit',v_unit.id,jsonb_build_object('organizationId',p_organization_id));
 return to_jsonb(v_unit)-'created_by';
end $function$
;
CREATE OR REPLACE FUNCTION public.register_my_partner_organization(p_name text, p_type text, p_registration_number text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select private.commercial_user());
  v_confirmed timestamptz;
  v_org public.partner_organizations%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select email_confirmed_at into v_confirmed from auth.users where id=v_user;
  if v_confirmed is null then raise exception 'EMAIL_NOT_CONFIRMED' using errcode='42501'; end if;
  if p_type not in ('INSURANCE','CORPORATE','DISTRIBUTOR','OTHER') then raise exception 'INVALID_PARTNER_TYPE' using errcode='22023'; end if;
  if nullif(trim(p_name),'') is null or char_length(trim(p_name))>160 then raise exception 'INVALID_PARTNER_NAME' using errcode='22023'; end if;

  select o.* into v_org
  from public.partner_memberships m
  join public.partner_organizations o on o.id=m.organization_id
  where m.user_id=v_user and m.status='ACTIVE'
  order by m.created_at
  limit 1;
  if v_org.id is not null then
    return jsonb_build_object('organization',to_jsonb(v_org),'created',false);
  end if;

  insert into public.partner_organizations(name,type,status,trusted_generation,registration_number,generation_limit_per_day)
  values(trim(p_name),p_type,'PENDING',false,nullif(trim(p_registration_number),''),100)
  returning * into v_org;
  insert into public.partner_memberships(organization_id,user_id,role,status)
  values(v_org.id,v_user,'PARTNER_ADMIN','ACTIVE');
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','PARTNER_APPLICATION_SUBMITTED','partner_organization',v_org.id,jsonb_build_object('type',p_type));
  return jsonb_build_object('organization',to_jsonb(v_org),'created',true);
exception when unique_violation then
  raise exception 'REGISTRATION_NUMBER_EXISTS' using errcode='23505';
end $function$
;
CREATE OR REPLACE FUNCTION public.respond_to_institutional_action(p_action_id uuid, p_response text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_action public.institutional_actions%rowtype; v_new_status text; v_old_status text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_response not in ('SEEN','WILL_MOVE') then raise exception 'INVALID_RESPONSE' using errcode='22023'; end if;
  select a.* into v_action from public.institutional_actions a join public.vehicles v on v.id=a.vehicle_id where a.id=p_action_id and v.owner_id=v_user for update;
  if v_action.id is null then raise exception 'ACTION_NOT_FOUND' using errcode='P0002'; end if;
  if v_action.status not in ('SENT','DELIVERED','ACKNOWLEDGED') then raise exception 'ACTION_NOT_RESPONDABLE' using errcode='22023'; end if;
  v_old_status:=v_action.status;
  v_new_status:='ACKNOWLEDGED';
  update public.institutional_actions set status=v_new_status,owner_response=p_response,acknowledged_at=coalesce(acknowledged_at,now()),updated_at=now() where id=p_action_id returning * into v_action;
  insert into public.institutional_action_events(action_id,event_type,actor_id,actor_kind,from_status,to_status,safe_metadata)
  values(v_action.id,'OWNER_ACKNOWLEDGED',v_user,'OWNER',v_old_status,v_new_status,jsonb_build_object('response',p_response));
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'OWNER','INSTITUTIONAL_ACTION_ACKNOWLEDGED','institutional_action',v_action.id,jsonb_build_object('response',p_response,'organizationId',v_action.organization_id));
  return jsonb_build_object('id',v_action.id,'status',v_action.status,'ownerResponse',v_action.owner_response,'acknowledgedAt',v_action.acknowledged_at);
end $function$
;
CREATE OR REPLACE FUNCTION public.respond_to_report(p_report_id uuid, p_response text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_status text; v_event text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_response not in ('ON_MY_WAY','RESOLVED','CANNOT_REACH_NOW') then raise exception 'INVALID_RESPONSE' using errcode='22023'; end if;
  if not exists(select 1 from public.reports r join public.vehicles v on v.id=r.vehicle_id where r.id=p_report_id and v.owner_id=v_user) then raise exception 'REPORT_NOT_FOUND' using errcode='P0002'; end if;
  v_status := case when p_response='RESOLVED' then 'RESOLVED' else 'ACKNOWLEDGED' end;
  v_event := case p_response when 'ON_MY_WAY' then 'OWNER_ON_MY_WAY' when 'RESOLVED' then 'REPORT_RESOLVED' else 'OWNER_CANNOT_REACH' end;
  update public.reports set owner_response=p_response,status=v_status where id=p_report_id;
  insert into public.report_events(report_id,event_type,actor_id) values(p_report_id,v_event,v_user);
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id) values(v_user,'OWNER','REPORT_RESPONDED','report',p_report_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.preview_partner_invitation(p_token_hash text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('email',i.email,'organizationName',o.name,'role',i.role,'expiresAt',i.expires_at)
  from public.partner_invitations i join public.partner_organizations o on o.id=i.organization_id
  where i.token_hash=p_token_hash and i.claimed_at is null and i.revoked_at is null and i.expires_at>now() and o.status='ACTIVE'
$function$
;
commit;
