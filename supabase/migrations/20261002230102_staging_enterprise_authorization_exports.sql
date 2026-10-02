-- Staging-only fixes: explicit enterprise capabilities and commercial export compatibility.
begin;
create or replace function private.can_generate_for_partner(org_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.live_account_session() and exists(
 select 1 from public.partner_memberships m join public.partner_organizations o on o.id=m.organization_id
 where m.organization_id=org_id and m.user_id=auth.uid() and m.status='ACTIVE'
 and m.role in ('PARTNER_ADMIN','PARTNER_OPERATOR') and o.status='ACTIVE')
$$;
revoke all on function private.can_generate_for_partner(uuid) from public,anon,service_role;
grant execute on function private.can_generate_for_partner(uuid) to authenticated;
create or replace function private.is_partner_member(org_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.live_account_session() and exists(select 1 from public.partner_memberships m join public.partner_organizations o on o.id=m.organization_id
 where m.organization_id=org_id and m.user_id=auth.uid() and m.status='ACTIVE' and o.status in ('PENDING','ACTIVE'))
$$;
-- Reading CSV credentials requires an issuing role, not just membership.
alter policy partner_exports_read on public.production_exports using (exists(select 1 from public.code_batches b where b.id=production_exports.batch_id and private.can_generate_for_partner(b.organization_id)));
alter policy partner_export_objects_insert on storage.objects with check (bucket_id='production-exports' and private.can_generate_for_partner((select b.organization_id from public.code_batches b where b.id=(storage.foldername(objects.name))[1]::uuid)));
alter policy partner_export_objects_select on storage.objects using (bucket_id='production-exports' and exists(select 1 from public.production_exports e join public.code_batches b on b.id=e.batch_id where e.storage_path=objects.name and e.expires_at>now() and private.can_generate_for_partner(b.organization_id)));
CREATE OR REPLACE FUNCTION public.org_allocate_inventory(p_organization_id uuid, p_batch_id uuid, p_site_id uuid, p_unit_id uuid, p_custodian_membership_id uuid, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user()); v_batch public.code_batches%rowtype; v_allocated integer; v_allocation public.organization_inventory_allocations%rowtype;
begin
 perform 1 from public.partner_organizations where id=p_organization_id for update;
 if not private.has_org_permission(p_organization_id,'ORG_INVENTORY_MANAGE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.org_assign_member_scope(p_organization_id uuid, p_membership_id uuid, p_site_id uuid, p_unit_id uuid, p_scope_role text, p_is_primary boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user()); v_scope public.organization_member_scopes%rowtype;
begin
 perform 1 from public.partner_organizations where id=p_organization_id for update;
 if not private.has_org_permission(p_organization_id,'ORG_SCOPE_ASSIGN',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_site_id is not null and p_unit_id is not null and not exists(select 1 from public.organization_units where id=p_unit_id and organization_id=p_organization_id and site_id=p_site_id) then raise exception 'UNIT_SITE_MISMATCH' using errcode='23514'; end if;
 if p_is_primary then update public.organization_member_scopes set is_primary=false where membership_id=p_membership_id and ended_at is null; end if;
 insert into public.organization_member_scopes(organization_id,membership_id,site_id,unit_id,scope_role,is_primary,assigned_by)
 values(p_organization_id,p_membership_id,p_site_id,p_unit_id,p_scope_role,p_is_primary,v_user) returning * into v_scope;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(v_user,'PARTNER','ORGANIZATION_MEMBER_SCOPE_ASSIGNED','organization_member_scope',v_scope.id,jsonb_build_object('organizationId',p_organization_id,'membershipId',p_membership_id));
 return to_jsonb(v_scope)-'assigned_by';
end $function$;

CREATE OR REPLACE FUNCTION public.org_manage_operation(p_organization_id uuid, p_action_id uuid, p_assigned_membership_id uuid, p_priority text, p_site_id uuid, p_unit_id uuid, p_note text, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user()); v_action public.institutional_actions%rowtype; v_minutes integer;
begin
 perform 1 from public.partner_organizations where id=p_organization_id for update;
 if not private.has_org_permission(p_organization_id,'ORG_OPERATION_MANAGE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_site_id is not null and p_unit_id is not null and not exists(select 1 from public.organization_units where id=p_unit_id and organization_id=p_organization_id and site_id=p_site_id) then raise exception 'UNIT_SITE_MISMATCH' using errcode='23514'; end if;
 select resolution_minutes into v_minutes from public.organization_sla_policies where organization_id=p_organization_id and priority=p_priority;
 update public.institutional_actions set assigned_membership_id=p_assigned_membership_id,assigned_at=case when assigned_membership_id is distinct from p_assigned_membership_id then now() else assigned_at end,
  priority=p_priority,site_id=p_site_id,unit_id=p_unit_id,operational_note=nullif(trim(p_note),''),sla_due_at=created_at+make_interval(mins=>coalesce(v_minutes,480)),updated_at=now()
 where id=p_action_id and organization_id=p_organization_id and updated_at=p_expected_updated_at returning * into v_action;
 if v_action.id is null then raise exception 'ACTION_CONFLICT' using errcode='40001'; end if;
 insert into public.institutional_action_events(action_id,event_type,actor_id,actor_kind,safe_metadata) values(v_action.id,'OPERATION_ASSIGNED',v_user,'ORGANIZATION_MEMBER',jsonb_build_object('assigneeMembershipId',p_assigned_membership_id,'priority',p_priority,'siteId',p_site_id,'unitId',p_unit_id));
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(v_user,'PARTNER','INSTITUTIONAL_OPERATION_MANAGED','institutional_action',v_action.id,jsonb_build_object('organizationId',p_organization_id));
 return jsonb_build_object('id',v_action.id,'updatedAt',v_action.updated_at,'slaDueAt',v_action.sla_due_at);
end $function$;

CREATE OR REPLACE FUNCTION public.org_set_sla_policy(p_organization_id uuid, p_priority text, p_acknowledgement_minutes integer, p_resolution_minutes integer, p_escalation_minutes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user());
begin
 perform 1 from public.partner_organizations where id=p_organization_id for update;
 if not private.has_org_permission(p_organization_id,'ORG_POLICY_MANAGE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 insert into public.organization_sla_policies(organization_id,priority,acknowledgement_minutes,resolution_minutes,escalation_minutes,updated_by)
 values(p_organization_id,p_priority,p_acknowledgement_minutes,p_resolution_minutes,p_escalation_minutes,v_user)
 on conflict(organization_id,priority) do update set acknowledgement_minutes=excluded.acknowledgement_minutes,resolution_minutes=excluded.resolution_minutes,escalation_minutes=excluded.escalation_minutes,updated_by=v_user,updated_at=now();
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(v_user,'PARTNER','ORGANIZATION_SLA_POLICY_UPDATED','partner_organization',p_organization_id,jsonb_build_object('organizationId',p_organization_id,'priority',p_priority));
 return jsonb_build_object('priority',p_priority,'acknowledgementMinutes',p_acknowledgement_minutes,'resolutionMinutes',p_resolution_minutes,'escalationMinutes',p_escalation_minutes);
end $function$;

CREATE OR REPLACE FUNCTION public.org_upsert_site(p_organization_id uuid, p_site_id uuid, p_code text, p_name text, p_site_type text, p_address text, p_status text, p_is_primary boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user()); v_site public.organization_sites%rowtype;
begin
 perform 1 from public.partner_organizations where id=p_organization_id for update;
 if not private.has_org_permission(p_organization_id,'ORG_STRUCTURE_MANAGE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.org_upsert_unit(p_organization_id uuid, p_unit_id uuid, p_site_id uuid, p_parent_unit_id uuid, p_code text, p_name text, p_unit_type text, p_cost_center text, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user()); v_unit public.organization_units%rowtype;
begin
 perform 1 from public.partner_organizations where id=p_organization_id for update;
 if not private.has_org_permission(p_organization_id,'ORG_STRUCTURE_MANAGE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.get_enterprise_console(p_organization_id uuid, p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user()); v_admin boolean; v_manage_structure boolean; v_manage_operations boolean; v_manage_scope boolean; v_manage_policy boolean; v_manage_inventory boolean; v_view_reports boolean; v_view_members boolean; v_result jsonb;
begin
 if not private.is_active_org_member(p_organization_id,v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_from>=p_to or p_to-p_from>interval '366 days' then raise exception 'INVALID_PERIOD' using errcode='22023'; end if;
 v_admin:=private.is_org_admin(p_organization_id,v_user);
 v_manage_structure:=private.has_org_permission(p_organization_id,'ORG_STRUCTURE_MANAGE',v_user);
 v_manage_operations:=private.has_org_permission(p_organization_id,'ORG_OPERATION_MANAGE',v_user);
 v_manage_scope:=private.has_org_permission(p_organization_id,'ORG_SCOPE_ASSIGN',v_user);
 v_manage_policy:=private.has_org_permission(p_organization_id,'ORG_POLICY_MANAGE',v_user);
 v_manage_inventory:=private.has_org_permission(p_organization_id,'ORG_INVENTORY_MANAGE',v_user);
 v_view_reports:=v_manage_operations or private.has_org_permission(p_organization_id,'ORG_REPORT_VIEW',v_user);
 v_view_members:=v_manage_scope or v_manage_operations or private.has_org_permission(p_organization_id,'ORG_MEMBER_VIEW',v_user);
 v_result:=jsonb_build_object(
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
 if not (v_manage_structure or v_manage_scope or v_manage_operations or v_manage_inventory) then v_result:=v_result||'{"sites":[],"units":[]}'::jsonb;end if;
 if not v_manage_scope then v_result:=v_result||'{"scopes":[]}'::jsonb;end if;
 if not v_manage_policy then v_result:=v_result||'{"policies":[]}'::jsonb;end if;
 if not v_view_reports then v_result:=v_result||'{"operations":[],"metrics":{}}'::jsonb;end if;
 if not v_view_members then v_result:=v_result||'{"workforce":[]}'::jsonb;end if;
 if not v_manage_inventory then v_result:=v_result||'{"inventory":[]}'::jsonb;end if;
 return v_result;
end $function$;
commit;
