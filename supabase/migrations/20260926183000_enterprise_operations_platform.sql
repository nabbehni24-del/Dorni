begin;

-- Enterprise operating model: sites, organization units, scoped workforce,
-- inventory allocation and SLA-owned case management. Organization type remains
-- classification only and never grants authority.
create or replace function private.is_org_admin(p_organization_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.partner_memberships m
    join public.partner_organizations o on o.id=m.organization_id and o.status='ACTIVE'
    join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id and r.active
    where m.organization_id=p_organization_id and m.user_id=p_user_id and m.status='ACTIVE' and r.code='PARTNER_ADMIN'
  )
$$;

create table public.organization_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.partner_organizations(id) on delete cascade,
  code text not null check(code ~ '^[A-Z0-9][A-Z0-9_-]{1,30}$'),
  name text not null check(char_length(name) between 2 and 120),
  site_type text not null default 'BRANCH' check(site_type in ('HEADQUARTERS','BRANCH','FACILITY','PARKING','WAREHOUSE','FIELD_ZONE')),
  address_text text check(address_text is null or char_length(address_text)<=240),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
  is_primary boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,code), unique(id,organization_id)
);
create unique index organization_sites_one_primary_idx on public.organization_sites(organization_id) where is_primary and status='ACTIVE';
create index organization_sites_org_status_idx on public.organization_sites(organization_id,status,name);

create table public.organization_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.partner_organizations(id) on delete cascade,
  site_id uuid,
  parent_unit_id uuid,
  code text not null check(code ~ '^[A-Z0-9][A-Z0-9_-]{1,30}$'),
  name text not null check(char_length(name) between 2 and 120),
  unit_type text not null default 'TEAM' check(unit_type in ('DIVISION','DEPARTMENT','TEAM','SHIFT')),
  cost_center text check(cost_center is null or char_length(cost_center)<=40),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,code), unique(id,organization_id),
  foreign key(site_id,organization_id) references public.organization_sites(id,organization_id),
  foreign key(parent_unit_id,organization_id) references public.organization_units(id,organization_id),
  check(parent_unit_id is null or parent_unit_id<>id)
);
create index organization_units_org_site_idx on public.organization_units(organization_id,site_id,status);
create index organization_units_parent_idx on public.organization_units(parent_unit_id) where parent_unit_id is not null;

alter table public.partner_memberships add constraint partner_memberships_id_organization_key unique(id,organization_id);
create table public.organization_member_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.partner_organizations(id) on delete cascade,
  membership_id uuid not null,
  site_id uuid,
  unit_id uuid,
  scope_role text not null default 'MEMBER' check(scope_role in ('MEMBER','SUPERVISOR','MANAGER')),
  is_primary boolean not null default false,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key(membership_id,organization_id) references public.partner_memberships(id,organization_id),
  foreign key(site_id,organization_id) references public.organization_sites(id,organization_id),
  foreign key(unit_id,organization_id) references public.organization_units(id,organization_id),
  check(site_id is not null or unit_id is not null),
  check(ended_at is null or ended_at>=assigned_at)
);
create unique index organization_member_scopes_active_idx on public.organization_member_scopes(membership_id,coalesce(site_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(unit_id,'00000000-0000-0000-0000-000000000000'::uuid)) where ended_at is null;
create unique index organization_member_scopes_primary_idx on public.organization_member_scopes(membership_id) where is_primary and ended_at is null;
create index organization_member_scopes_org_unit_idx on public.organization_member_scopes(organization_id,unit_id,membership_id) where ended_at is null;

create table public.organization_sla_policies (
  organization_id uuid not null references public.partner_organizations(id) on delete cascade,
  priority text not null check(priority in ('LOW','NORMAL','HIGH','CRITICAL')),
  acknowledgement_minutes integer not null check(acknowledgement_minutes between 1 and 10080),
  resolution_minutes integer not null check(resolution_minutes between 1 and 43200),
  escalation_minutes integer not null check(escalation_minutes between 1 and 10080),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key(organization_id,priority),
  check(acknowledgement_minutes<=resolution_minutes)
);

alter table public.institutional_actions
  add column if not exists site_id uuid,
  add column if not exists unit_id uuid,
  add column if not exists assigned_membership_id uuid,
  add column if not exists priority text not null default 'NORMAL' check(priority in ('LOW','NORMAL','HIGH','CRITICAL')),
  add column if not exists sla_due_at timestamptz,
  add column if not exists escalation_level smallint not null default 0 check(escalation_level between 0 and 5),
  add column if not exists operational_note text check(operational_note is null or char_length(operational_note)<=500),
  add column if not exists assigned_at timestamptz;
alter table public.institutional_actions
  add constraint institutional_actions_site_fkey foreign key(site_id,organization_id) references public.organization_sites(id,organization_id),
  add constraint institutional_actions_unit_fkey foreign key(unit_id,organization_id) references public.organization_units(id,organization_id),
  add constraint institutional_actions_assignee_fkey foreign key(assigned_membership_id,organization_id) references public.partner_memberships(id,organization_id);
create index institutional_actions_org_queue_idx on public.institutional_actions(organization_id,status,priority,sla_due_at,created_at desc);
create index institutional_actions_assignee_open_idx on public.institutional_actions(assigned_membership_id,status,sla_due_at) where assigned_membership_id is not null and status not in ('COMPLETED','CANCELLED','EXPIRED');

alter table public.code_batches add constraint code_batches_id_organization_key unique(id,organization_id);
create table public.organization_inventory_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.partner_organizations(id) on delete cascade,
  batch_id uuid not null,
  site_id uuid,
  unit_id uuid,
  custodian_membership_id uuid,
  quantity integer not null check(quantity>0),
  status text not null default 'ALLOCATED' check(status in ('ALLOCATED','RELEASED')),
  allocated_by uuid not null references public.profiles(id),
  allocated_at timestamptz not null default now(),
  released_at timestamptz,
  foreign key(batch_id,organization_id) references public.code_batches(id,organization_id),
  foreign key(site_id,organization_id) references public.organization_sites(id,organization_id),
  foreign key(unit_id,organization_id) references public.organization_units(id,organization_id),
  foreign key(custodian_membership_id,organization_id) references public.partner_memberships(id,organization_id),
  check(site_id is not null or unit_id is not null),
  check((status='ALLOCATED' and released_at is null) or (status='RELEASED' and released_at is not null))
);
create index organization_inventory_allocations_org_idx on public.organization_inventory_allocations(organization_id,status,batch_id);

alter table public.organization_sites enable row level security;
alter table public.organization_units enable row level security;
alter table public.organization_member_scopes enable row level security;
alter table public.organization_sla_policies enable row level security;
alter table public.organization_inventory_allocations enable row level security;
revoke all on public.organization_sites,public.organization_units,public.organization_member_scopes,public.organization_sla_policies,public.organization_inventory_allocations from anon,authenticated;

insert into public.organization_permissions(code,label_ar,risk_level) values
 ('ORG_STRUCTURE_MANAGE','إدارة الفروع والوحدات',3),
 ('ORG_SCOPE_ASSIGN','توزيع نطاقات عمل الموظفين',3),
 ('ORG_OPERATION_MANAGE','تعيين الحالات والأولوية والتصعيد',3),
 ('ORG_POLICY_MANAGE','إدارة سياسات SLA',4),
 ('ORG_INVENTORY_MANAGE','توزيع مخزون الأكواد',3)
on conflict(code) do update set label_ar=excluded.label_ar,risk_level=excluded.risk_level,active=true;

insert into public.organization_sla_policies(organization_id,priority,acknowledgement_minutes,resolution_minutes,escalation_minutes)
select o.id,p.priority,p.ack,p.resolve,p.escalate from public.partner_organizations o
cross join (values ('LOW',240,1440,360),('NORMAL',60,480,120),('HIGH',20,120,30),('CRITICAL',5,30,10)) p(priority,ack,resolve,escalate)
on conflict do nothing;

create or replace function private.ensure_enterprise_defaults()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.organization_sla_policies(organization_id,priority,acknowledgement_minutes,resolution_minutes,escalation_minutes) values
   (new.id,'LOW',240,1440,360),(new.id,'NORMAL',60,480,120),(new.id,'HIGH',20,120,30),(new.id,'CRITICAL',5,30,10)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists ensure_enterprise_defaults on public.partner_organizations;
create trigger ensure_enterprise_defaults after insert on public.partner_organizations for each row execute function private.ensure_enterprise_defaults();

create or replace function private.populate_enterprise_action_context()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_scope public.organization_member_scopes%rowtype; v_minutes integer;
begin
  select * into v_scope from public.organization_member_scopes
  where membership_id=new.membership_id and organization_id=new.organization_id and ended_at is null
  order by is_primary desc,assigned_at limit 1;
  new.site_id:=coalesce(new.site_id,v_scope.site_id);
  new.unit_id:=coalesce(new.unit_id,v_scope.unit_id);
  select resolution_minutes into v_minutes from public.organization_sla_policies
    where organization_id=new.organization_id and priority=new.priority;
  new.sla_due_at:=coalesce(new.sla_due_at,now()+make_interval(mins=>coalesce(v_minutes,480)));
  return new;
end $$;
drop trigger if exists populate_enterprise_action_context on public.institutional_actions;
create trigger populate_enterprise_action_context before insert on public.institutional_actions for each row execute function private.populate_enterprise_action_context();
update public.institutional_actions a set sla_due_at=a.created_at+make_interval(mins=>p.resolution_minutes)
from public.organization_sla_policies p where p.organization_id=a.organization_id and p.priority=a.priority and a.sla_due_at is null;
alter table public.institutional_actions alter column sla_due_at set not null;

create or replace function public.org_upsert_site(p_organization_id uuid,p_site_id uuid,p_code text,p_name text,p_site_type text,p_address text,p_status text,p_is_primary boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_site public.organization_sites%rowtype;
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
end $$;

create or replace function public.org_upsert_unit(p_organization_id uuid,p_unit_id uuid,p_site_id uuid,p_parent_unit_id uuid,p_code text,p_name text,p_unit_type text,p_cost_center text,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_unit public.organization_units%rowtype;
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
end $$;

create or replace function public.org_assign_member_scope(p_organization_id uuid,p_membership_id uuid,p_site_id uuid,p_unit_id uuid,p_scope_role text,p_is_primary boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_scope public.organization_member_scopes%rowtype;
begin
 if not private.is_org_admin(p_organization_id,v_user) and not private.has_org_permission(p_organization_id,'ORG_SCOPE_ASSIGN',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_site_id is not null and p_unit_id is not null and not exists(select 1 from public.organization_units where id=p_unit_id and organization_id=p_organization_id and site_id=p_site_id) then raise exception 'UNIT_SITE_MISMATCH' using errcode='23514'; end if;
 if p_is_primary then update public.organization_member_scopes set is_primary=false where membership_id=p_membership_id and ended_at is null; end if;
 insert into public.organization_member_scopes(organization_id,membership_id,site_id,unit_id,scope_role,is_primary,assigned_by)
 values(p_organization_id,p_membership_id,p_site_id,p_unit_id,p_scope_role,p_is_primary,v_user) returning * into v_scope;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(v_user,'PARTNER','ORGANIZATION_MEMBER_SCOPE_ASSIGNED','organization_member_scope',v_scope.id,jsonb_build_object('organizationId',p_organization_id,'membershipId',p_membership_id));
 return to_jsonb(v_scope)-'assigned_by';
end $$;

create or replace function public.org_manage_operation(p_organization_id uuid,p_action_id uuid,p_assigned_membership_id uuid,p_priority text,p_site_id uuid,p_unit_id uuid,p_note text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_action public.institutional_actions%rowtype; v_minutes integer;
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
end $$;

create or replace function public.org_allocate_inventory(p_organization_id uuid,p_batch_id uuid,p_site_id uuid,p_unit_id uuid,p_custodian_membership_id uuid,p_quantity integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_batch public.code_batches%rowtype; v_allocated integer; v_allocation public.organization_inventory_allocations%rowtype;
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
end $$;

create or replace function public.org_set_sla_policy(p_organization_id uuid,p_priority text,p_acknowledgement_minutes integer,p_resolution_minutes integer,p_escalation_minutes integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid());
begin
 if not private.is_org_admin(p_organization_id,v_user) and not private.has_org_permission(p_organization_id,'ORG_POLICY_MANAGE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 insert into public.organization_sla_policies(organization_id,priority,acknowledgement_minutes,resolution_minutes,escalation_minutes,updated_by)
 values(p_organization_id,p_priority,p_acknowledgement_minutes,p_resolution_minutes,p_escalation_minutes,v_user)
 on conflict(organization_id,priority) do update set acknowledgement_minutes=excluded.acknowledgement_minutes,resolution_minutes=excluded.resolution_minutes,escalation_minutes=excluded.escalation_minutes,updated_by=v_user,updated_at=now();
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(v_user,'PARTNER','ORGANIZATION_SLA_POLICY_UPDATED','partner_organization',p_organization_id,jsonb_build_object('organizationId',p_organization_id,'priority',p_priority));
 return jsonb_build_object('priority',p_priority,'acknowledgementMinutes',p_acknowledgement_minutes,'resolutionMinutes',p_resolution_minutes,'escalationMinutes',p_escalation_minutes);
end $$;

create or replace function public.get_enterprise_console(p_organization_id uuid,p_from timestamptz default now()-interval '30 days',p_to timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_admin boolean; v_manage_structure boolean; v_manage_operations boolean; v_manage_scope boolean; v_manage_policy boolean; v_manage_inventory boolean;
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
end $$;

revoke all on function private.is_org_admin(uuid,uuid),private.ensure_enterprise_defaults(),private.populate_enterprise_action_context() from public,anon,authenticated;
revoke all on function public.org_upsert_site(uuid,uuid,text,text,text,text,text,boolean),public.org_upsert_unit(uuid,uuid,uuid,uuid,text,text,text,text,text),public.org_assign_member_scope(uuid,uuid,uuid,uuid,text,boolean),public.org_manage_operation(uuid,uuid,uuid,text,uuid,uuid,text,timestamptz),public.org_set_sla_policy(uuid,text,integer,integer,integer),public.org_allocate_inventory(uuid,uuid,uuid,uuid,uuid,integer),public.get_enterprise_console(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.org_upsert_site(uuid,uuid,text,text,text,text,text,boolean),public.org_upsert_unit(uuid,uuid,uuid,uuid,text,text,text,text,text),public.org_assign_member_scope(uuid,uuid,uuid,uuid,text,boolean),public.org_manage_operation(uuid,uuid,uuid,text,uuid,uuid,text,timestamptz),public.org_set_sla_policy(uuid,text,integer,integer,integer),public.org_allocate_inventory(uuid,uuid,uuid,uuid,uuid,integer),public.get_enterprise_console(uuid,timestamptz,timestamptz) to authenticated;

commit;

