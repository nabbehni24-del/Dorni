begin;

-- Phase 3 is additive. Organization type is classification only; no policy or
-- function below derives authority from partner_organizations.type.
alter table public.partner_organizations drop constraint if exists partner_organizations_type_check;
alter table public.partner_organizations add constraint partner_organizations_type_check
  check (type in ('INSURANCE','CORPORATE','DISTRIBUTOR','TRAFFIC','TOWING_OPERATOR','PARKING_OPERATOR','OTHER'));
alter table public.partner_organizations
  add column if not exists institutional_enabled boolean not null default false,
  add column if not exists institutional_enabled_at timestamptz,
  add column if not exists institutional_enabled_by uuid references public.profiles(id);

create table public.organization_permissions (
  code text primary key check (code ~ '^[A-Z][A-Z0-9_]{2,80}$'),
  label_ar text not null,
  risk_level smallint not null default 1 check (risk_level between 1 and 5),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.organization_entitlements (
  organization_id uuid not null references public.partner_organizations(id) on delete cascade,
  permission_code text not null references public.organization_permissions(code),
  granted_by uuid not null references public.profiles(id),
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id),
  revoked_at timestamptz,
  primary key (organization_id, permission_code),
  check ((revoked_at is null) = (revoked_by is null))
);

create table public.organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.partner_organizations(id) on delete cascade,
  code text not null check (code ~ '^[A-Z][A-Z0-9_]{2,60}$'),
  name_ar text not null check (char_length(name_ar) between 2 and 100),
  system_role boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.organization_role_permissions (
  role_id uuid not null references public.organization_roles(id) on delete cascade,
  permission_code text not null references public.organization_permissions(code),
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (role_id, permission_code)
);

alter table public.partner_memberships add column if not exists role_id uuid references public.organization_roles(id);
alter table public.partner_invitations add column if not exists role_id uuid references public.organization_roles(id);

create table public.institutional_action_types (
  code text primary key,
  label_ar text not null,
  required_permission text not null references public.organization_permissions(code),
  active boolean not null default true,
  acknowledgement_required boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.institutional_action_reasons (
  code text primary key,
  action_type text not null references public.institutional_action_types(code),
  label_ar text not null,
  requires_note boolean not null default false,
  active boolean not null default true,
  display_order integer not null default 0
);

create sequence public.dorni_institutional_reference start 1000;

create table public.institutional_actions (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  organization_id uuid not null references public.partner_organizations(id),
  membership_id uuid not null references public.partner_memberships(id),
  actor_id uuid not null references public.profiles(id),
  code_id uuid not null references public.codes(id),
  vehicle_id uuid not null references public.vehicles(id),
  action_type text not null references public.institutional_action_types(code),
  reason_code text not null references public.institutional_action_reasons(code),
  reason_note text check (reason_note is null or char_length(reason_note) between 3 and 240),
  status text not null default 'SENT' check (status in ('CREATED','SENT','DELIVERED','ACKNOWLEDGED','COMPLETED','CANCELLED','EXPIRED','FAILED')),
  owner_response text check (owner_response in ('SEEN','WILL_MOVE')),
  idempotency_key text not null,
  correlation_id uuid not null default gen_random_uuid(),
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (membership_id, idempotency_key)
);

create table public.institutional_action_events (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.institutional_actions(id) on delete cascade,
  event_type text not null,
  actor_id uuid references public.profiles(id),
  actor_kind text not null check (actor_kind in ('OWNER','ORGANIZATION_MEMBER','DORNI_ADMIN','SYSTEM')),
  from_status text,
  to_status text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.notification_messages add column if not exists institutional_action_id uuid references public.institutional_actions(id);
alter table public.notification_messages drop constraint if exists notification_messages_one_source;
alter table public.notification_messages add constraint notification_messages_one_source
  check (num_nonnulls(report_id, institutional_action_id) <= 1);

alter table private.push_jobs add column if not exists institutional_action_id uuid references public.institutional_actions(id) on delete cascade;
create index if not exists push_jobs_institutional_action_idx on private.push_jobs(institutional_action_id) where institutional_action_id is not null;

create or replace function private.enqueue_report_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.channel='IN_APP' and new.template_code in ('REPORT_CREATED','INSTITUTIONAL_MOVE_REQUEST') then
    insert into private.push_jobs(subscription_id,recipient_id,session_id,message_id,report_id,institutional_action_id)
    select s.id,s.user_id,s.session_id,new.id,new.report_id,new.institutional_action_id from private.push_subscriptions s
    join auth.sessions a on a.id=s.session_id and a.user_id=s.user_id
    where s.user_id=new.recipient_id and s.enabled;
  end if;
  return new;
end $$;
revoke all on function private.enqueue_report_push() from public,anon,authenticated;

create or replace function private.claim_push_jobs(p_limit integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  update private.push_jobs j set state='CANCELLED' where j.state in ('QUEUED','SENDING') and (
    j.created_at<now()-interval '1 hour'
    or not exists(select 1 from private.push_subscriptions s join auth.sessions a on a.id=s.session_id and a.user_id=s.user_id where s.id=j.subscription_id and s.enabled and s.user_id=j.recipient_id and s.session_id=j.session_id)
    or (j.report_id is not null and not exists(select 1 from public.reports r where r.id=j.report_id and r.status='ACTIVE' and r.expires_at>now()))
    or (j.institutional_action_id is not null and not exists(select 1 from public.institutional_actions a where a.id=j.institutional_action_id and a.status in ('SENT','DELIVERED','ACKNOWLEDGED') and a.expires_at>now()))
  );
  update private.push_jobs set state='FAILED' where state='SENDING' and lease_until<now() and attempts>=5;
  with picked as (select id from private.push_jobs where ((state='QUEUED' and next_attempt_at<=now()) or (state='SENDING' and lease_until<now())) and attempts<5 order by created_at for update skip locked limit greatest(1,least(p_limit,20))),
  claimed as (update private.push_jobs j set state='SENDING',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' from picked p where j.id=p.id returning j.*)
  select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease_token',j.lease_token,'report_id',j.report_id,'institutional_action_id',j.institutional_action_id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth_key)),'[]'::jsonb) into result from claimed j join private.push_subscriptions s on s.id=j.subscription_id;
  return result;
end $$;

create index organization_entitlements_active_idx on public.organization_entitlements(organization_id,permission_code) where revoked_at is null;
create index organization_roles_org_active_idx on public.organization_roles(organization_id,active);
create index organization_role_permissions_permission_idx on public.organization_role_permissions(permission_code,role_id);
create index partner_memberships_role_id_idx on public.partner_memberships(role_id) where role_id is not null;
create index institutional_actions_org_created_idx on public.institutional_actions(organization_id,created_at desc);
create index institutional_actions_vehicle_created_idx on public.institutional_actions(vehicle_id,created_at desc);
create index institutional_actions_actor_created_idx on public.institutional_actions(actor_id,created_at desc);
create index institutional_actions_owner_open_idx on public.institutional_actions(vehicle_id,status,created_at desc) where status in ('SENT','DELIVERED','ACKNOWLEDGED');
create index institutional_action_events_action_created_idx on public.institutional_action_events(action_id,created_at);
create index notification_messages_institutional_action_idx on public.notification_messages(institutional_action_id) where institutional_action_id is not null;

alter table public.organization_permissions enable row level security;
alter table public.organization_entitlements enable row level security;
alter table public.organization_roles enable row level security;
alter table public.organization_role_permissions enable row level security;
alter table public.institutional_action_types enable row level security;
alter table public.institutional_action_reasons enable row level security;
alter table public.institutional_actions enable row level security;
alter table public.institutional_action_events enable row level security;

insert into public.organization_permissions(code,label_ar,risk_level) values
  ('ORG_MEMBER_VIEW','عرض أعضاء المؤسسة',1),
  ('ORG_MEMBER_INVITE','دعوة موظف',2),
  ('ORG_MEMBER_SUSPEND','إيقاف وإعادة تفعيل موظف',3),
  ('ORG_ROLE_ASSIGN','إدارة الأدوار والصلاحيات',3),
  ('ORG_AUDIT_VIEW','عرض سجل المؤسسة',2),
  ('ORG_REPORT_VIEW','عرض تقارير المؤسسة',2),
  ('VEHICLE_MOVE_REQUEST','إرسال طلب موثق لتحريك مركبة',2)
on conflict (code) do update set label_ar=excluded.label_ar,risk_level=excluded.risk_level;

insert into public.institutional_action_types(code,label_ar,required_permission,acknowledgement_required)
values ('VEHICLE_MOVE_REQUEST','طلب تحريك المركبة','VEHICLE_MOVE_REQUEST',true)
on conflict (code) do update set label_ar=excluded.label_ar,required_permission=excluded.required_permission,active=true;

insert into public.institutional_action_reasons(code,action_type,label_ar,requires_note,display_order) values
  ('BLOCKING_ACCESS','VEHICLE_MOVE_REQUEST','تعيق الوصول أو الخروج',false,1),
  ('OBSTRUCTING_TRAFFIC','VEHICLE_MOVE_REQUEST','تعرقل حركة المرور',false,2),
  ('SAFETY_REASON','VEHICLE_MOVE_REQUEST','سبب متعلق بالسلامة',false,3),
  ('OTHER','VEHICLE_MOVE_REQUEST','سبب آخر',true,4)
on conflict (code) do update set label_ar=excluded.label_ar,requires_note=excluded.requires_note,active=true,display_order=excluded.display_order;

create or replace function private.is_active_org_member(p_organization_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.partner_memberships m
    join public.partner_organizations o on o.id=m.organization_id
    where m.organization_id=p_organization_id and m.user_id=p_user_id
      and m.status='ACTIVE' and o.status='ACTIVE'
  )
$$;

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
      and o.status='ACTIVE' and o.institutional_enabled
  )
$$;

create or replace function private.is_dorni_super_admin(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.internal_memberships where user_id=p_user_id and active and role_code='SUPER_ADMIN')
$$;

-- Create compatible system roles for every existing organization. Existing partner
-- behavior keeps using the legacy role column until each route is deliberately migrated.
insert into public.organization_roles(organization_id,code,name_ar,system_role)
select o.id,v.code,v.name_ar,true from public.partner_organizations o
cross join (values ('PARTNER_ADMIN','مدير المؤسسة'),('PARTNER_OPERATOR','مشغّل'),('PARTNER_VIEWER','مشاهد')) v(code,name_ar)
on conflict (organization_id,code) do nothing;

update public.partner_memberships m set role_id=r.id
from public.organization_roles r
where r.organization_id=m.organization_id and r.code=m.role and m.role_id is null;

create or replace function private.ensure_default_organization_roles()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.organization_roles(organization_id,code,name_ar,system_role) values
    (new.id,'PARTNER_ADMIN','مدير المؤسسة',true),
    (new.id,'PARTNER_OPERATOR','مشغّل',true),
    (new.id,'PARTNER_VIEWER','مشاهد',true)
  on conflict (organization_id,code) do nothing;
  return new;
end $$;
drop trigger if exists ensure_default_organization_roles on public.partner_organizations;
create trigger ensure_default_organization_roles after insert on public.partner_organizations for each row execute function private.ensure_default_organization_roles();

create or replace function private.sync_partner_membership_role()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.role_id is null then select id into new.role_id from public.organization_roles where organization_id=new.organization_id and code=new.role and active limit 1; end if;
  if new.role_id is not null and not exists(select 1 from public.organization_roles where id=new.role_id and organization_id=new.organization_id and active) then raise exception 'ROLE_ORGANIZATION_MISMATCH' using errcode='23514'; end if;
  return new;
end $$;
drop trigger if exists sync_partner_membership_role on public.partner_memberships;
create trigger sync_partner_membership_role before insert or update of organization_id,role,role_id on public.partner_memberships for each row execute function private.sync_partner_membership_role();

create or replace function public.get_my_account_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_internal text; v_memberships jsonb;
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
    'destination',case when v_internal is not null then '/admin' when jsonb_array_length(v_memberships)>0 then '/partner' else '/app' end
  );
end $$;

create or replace function public.get_institutional_scan_context(p_public_token text,p_organization_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_org uuid; v_code uuid; v_manufacturer text; v_model text; v_color text; v_org_count integer; v_actions jsonb; v_orgs jsonb;
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
  where c.public_token=p_public_token and c.activation_state='ACTIVE' limit 1;
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
end $$;

create or replace function public.create_institutional_move_request(
  p_organization_id uuid,p_public_token text,p_reason_code text,p_reason_note text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_membership public.partner_memberships%rowtype; v_code uuid; v_vehicle uuid; v_owner uuid; v_reason public.institutional_action_reasons%rowtype; v_action public.institutional_actions%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not private.has_org_permission(p_organization_id,'VEHICLE_MOVE_REQUEST',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into v_membership from public.partner_memberships where organization_id=p_organization_id and user_id=v_user and status='ACTIVE' for share;
  select * into v_reason from public.institutional_action_reasons where code=p_reason_code and action_type='VEHICLE_MOVE_REQUEST' and active;
  if v_reason.code is null then raise exception 'INVALID_REASON' using errcode='22023'; end if;
  if v_reason.requires_note and (nullif(trim(p_reason_note),'') is null or char_length(trim(p_reason_note)) not between 3 and 240) then raise exception 'REASON_NOTE_REQUIRED' using errcode='22023'; end if;
  if char_length(p_idempotency_key) not between 16 and 120 then raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode='22023'; end if;
  select c.id,a.vehicle_id,v.owner_id into v_code,v_vehicle,v_owner
  from public.codes c join public.code_assignments a on a.code_id=c.id and a.ended_at is null
  join public.vehicles v on v.id=a.vehicle_id and v.archived_at is null
  where c.public_token=p_public_token and c.activation_state='ACTIVE' for share;
  if v_code is null then raise exception 'CODE_NOT_ACTIVE' using errcode='P0002'; end if;
  select * into v_action from public.institutional_actions where membership_id=v_membership.id and idempotency_key=p_idempotency_key;
  if v_action.id is not null then return jsonb_build_object('id',v_action.id,'referenceNumber',v_action.reference_number,'status',v_action.status,'created',false); end if;
  if (select count(*) from public.institutional_actions where membership_id=v_membership.id and created_at>now()-interval '10 minutes')>=10 then raise exception 'RATE_LIMITED' using errcode='P0001'; end if;
  if exists(select 1 from public.institutional_actions where organization_id=p_organization_id and code_id=v_code and action_type='VEHICLE_MOVE_REQUEST' and status in ('SENT','DELIVERED','ACKNOWLEDGED') and created_at>now()-interval '2 minutes') then raise exception 'DUPLICATE_ACTIVE_REQUEST' using errcode='P0001'; end if;
  insert into public.institutional_actions(reference_number,organization_id,membership_id,actor_id,code_id,vehicle_id,action_type,reason_code,reason_note,status,idempotency_key)
  values('DOR-MOVE-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.dorni_institutional_reference')::text,6,'0'),p_organization_id,v_membership.id,v_user,v_code,v_vehicle,'VEHICLE_MOVE_REQUEST',v_reason.code,nullif(trim(coalesce(p_reason_note,'')),''),'SENT',p_idempotency_key)
  returning * into v_action;
  insert into public.institutional_action_events(action_id,event_type,actor_id,actor_kind,to_status,safe_metadata)
  values(v_action.id,'ACTION_CREATED',v_user,'ORGANIZATION_MEMBER','SENT',jsonb_build_object('reasonCode',v_reason.code,'correlationId',v_action.correlation_id));
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','INSTITUTIONAL_MOVE_REQUEST_CREATED','institutional_action',v_action.id,jsonb_build_object('organizationId',p_organization_id,'membershipId',v_membership.id,'codeId',v_code,'reasonCode',v_reason.code,'correlationId',v_action.correlation_id));
  insert into public.notification_messages(institutional_action_id,recipient_id,channel,template_code)
  values(v_action.id,v_owner,'IN_APP','INSTITUTIONAL_MOVE_REQUEST');
  insert into public.notification_messages(institutional_action_id,recipient_id,channel,template_code)
  select v_action.id,v_owner,n.primary_channel,'INSTITUTIONAL_MOVE_REQUEST' from public.notification_preferences n where n.user_id=v_owner and n.primary_channel<>'IN_APP';
  return jsonb_build_object('id',v_action.id,'referenceNumber',v_action.reference_number,'status',v_action.status,'created',true);
end $$;

create or replace function public.respond_to_institutional_action(p_action_id uuid,p_response text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_action public.institutional_actions%rowtype; v_new_status text; v_old_status text;
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
end $$;

create or replace function public.get_owner_institutional_actions()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'referenceNumber',a.reference_number,'actionType',a.action_type,'reasonCode',a.reason_code,
    'status',a.status,'ownerResponse',a.owner_response,'createdAt',a.created_at,'acknowledgedAt',a.acknowledged_at,
    'organization',jsonb_build_object('name',o.name,'verified',o.institutional_enabled),
    'vehicle',jsonb_build_object('manufacturer',v.manufacturer,'model',v.model,'color',v.color)
  ) order by a.created_at desc),'[]'::jsonb)
  from public.institutional_actions a join public.vehicles v on v.id=a.vehicle_id
  join public.partner_organizations o on o.id=a.organization_id
  where v.owner_id=(select auth.uid())
$$;

create or replace function public.get_organization_institutional_overview(p_organization_id uuid,p_from timestamptz default (now()-interval '30 days'),p_to timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_can_actions boolean; v_can_members boolean; v_result jsonb;
begin
  v_can_actions:=private.has_org_permission(p_organization_id,'VEHICLE_MOVE_REQUEST',v_user) or private.has_org_permission(p_organization_id,'ORG_REPORT_VIEW',v_user);
  v_can_members:=private.has_org_permission(p_organization_id,'ORG_MEMBER_VIEW',v_user);
  if not v_can_actions and not v_can_members then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select jsonb_build_object(
    'organization',(select jsonb_build_object('id',o.id,'name',o.name,'status',o.status,'institutionalEnabled',o.institutional_enabled) from public.partner_organizations o where o.id=p_organization_id),
    'actions',case when v_can_actions then coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'referenceNumber',a.reference_number,'actionType',a.action_type,'reasonCode',a.reason_code,'status',a.status,'createdAt',a.created_at,'acknowledgedAt',a.acknowledged_at) order by a.created_at desc) from public.institutional_actions a where a.organization_id=p_organization_id and a.created_at>=p_from and a.created_at<p_to),'[]'::jsonb) else '[]'::jsonb end,
    'metrics',case when v_can_actions then (select jsonb_build_object('total',count(*),'acknowledged',count(*) filter(where acknowledged_at is not null),'completed',count(*) filter(where status='COMPLETED'),'unacknowledged',count(*) filter(where acknowledged_at is null and status in ('SENT','DELIVERED'))) from public.institutional_actions where organization_id=p_organization_id and created_at>=p_from and created_at<p_to) else '{}'::jsonb end,
    'members',case when v_can_members then coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',p.full_name,'email',p.email,'status',m.status,'roleId',m.role_id,'lastActivity',(select max(a.created_at) from public.institutional_actions a where a.membership_id=m.id),'actionCount',(select count(*) from public.institutional_actions a where a.membership_id=m.id and a.created_at>=p_from and a.created_at<p_to)) order by m.created_at) from public.partner_memberships m join public.profiles p on p.id=m.user_id where m.organization_id=p_organization_id),'[]'::jsonb) else '[]'::jsonb end,
    'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'code',r.code,'name',r.name_ar,'systemRole',r.system_role,'permissions',coalesce((select jsonb_agg(rp.permission_code) from public.organization_role_permissions rp where rp.role_id=r.id),'[]'::jsonb)) order by r.created_at) from public.organization_roles r where r.organization_id=p_organization_id and r.active),'[]'::jsonb),
    'entitlements',coalesce((select jsonb_agg(e.permission_code order by e.permission_code) from public.organization_entitlements e where e.organization_id=p_organization_id and e.revoked_at is null),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.org_upsert_role(p_organization_id uuid,p_role_id uuid,p_code text,p_name_ar text,p_permissions text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_role public.organization_roles%rowtype; v_permission text;
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
end $$;

create or replace function public.org_invite_member(p_organization_id uuid,p_email text,p_role_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_inv public.partner_invitations%rowtype;
begin
  if not private.has_org_permission(p_organization_id,'ORG_MEMBER_INVITE',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or nullif(trim(p_email),'') is null then raise exception 'INVALID_INVITATION' using errcode='22023'; end if;
  if not exists(select 1 from public.organization_roles where id=p_role_id and organization_id=p_organization_id and active) then raise exception 'INVALID_ROLE' using errcode='22023'; end if;
  insert into public.partner_invitations(organization_id,email,role,role_id,token_hash,created_by)
  values(p_organization_id,lower(trim(p_email)),'PARTNER_VIEWER',p_role_id,p_token_hash,v_user) returning * into v_inv;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','ORGANIZATION_MEMBER_INVITED','partner_invitation',v_inv.id,jsonb_build_object('organizationId',p_organization_id,'roleId',p_role_id));
  return jsonb_build_object('id',v_inv.id,'email',v_inv.email,'expiresAt',v_inv.expires_at);
end $$;

create or replace function public.claim_partner_invitation(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_email text; v_inv public.partner_invitations%rowtype; v_org_name text; v_membership public.partner_memberships%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select lower(email) into v_email from auth.users where id=v_user;
  select * into v_inv from public.partner_invitations where token_hash=p_token_hash and claimed_at is null and expires_at>now() for update;
  if v_inv.id is null then raise exception 'INVITATION_INVALID' using errcode='P0002'; end if;
  if lower(v_inv.email)<>v_email then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='42501'; end if;
  if not exists(select 1 from public.partner_organizations where id=v_inv.organization_id and status='ACTIVE') then raise exception 'ORGANIZATION_NOT_ACTIVE' using errcode='42501'; end if;
  insert into public.partner_memberships(organization_id,user_id,role,role_id,status)
  values(v_inv.organization_id,v_user,v_inv.role,v_inv.role_id,'ACTIVE')
  on conflict (organization_id,user_id) do update set role=excluded.role,role_id=excluded.role_id,status='ACTIVE'
  returning * into v_membership;
  update public.partner_invitations set claimed_by=v_user,claimed_at=now() where id=v_inv.id;
  select name into v_org_name from public.partner_organizations where id=v_inv.organization_id;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','ORGANIZATION_MEMBER_ACTIVATED','partner_membership',v_membership.id,jsonb_build_object('organizationId',v_inv.organization_id,'invitationId',v_inv.id,'roleId',v_inv.role_id));
  return jsonb_build_object('organizationId',v_inv.organization_id,'organizationName',v_org_name,'membershipId',v_membership.id,'roleId',v_inv.role_id);
end $$;

create or replace function public.org_set_member_status(p_organization_id uuid,p_membership_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_actor_membership uuid; v_member public.partner_memberships%rowtype;
begin
  if not private.has_org_permission(p_organization_id,'ORG_MEMBER_SUSPEND',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_status not in ('ACTIVE','SUSPENDED') then raise exception 'INVALID_STATUS' using errcode='22023'; end if;
  select id into v_actor_membership from public.partner_memberships where organization_id=p_organization_id and user_id=v_user and status='ACTIVE';
  if p_membership_id=v_actor_membership then raise exception 'CANNOT_SUSPEND_SELF' using errcode='22023'; end if;
  update public.partner_memberships set status=p_status where id=p_membership_id and organization_id=p_organization_id returning * into v_member;
  if v_member.id is null then raise exception 'MEMBER_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER',case when p_status='ACTIVE' then 'ORGANIZATION_MEMBER_REACTIVATED' else 'ORGANIZATION_MEMBER_SUSPENDED' end,'partner_membership',v_member.id,jsonb_build_object('organizationId',p_organization_id));
  return jsonb_build_object('id',v_member.id,'status',v_member.status);
end $$;

create or replace function public.admin_set_institutional_access(p_organization_id uuid,p_enabled boolean,p_entitlements text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_permission text; v_org public.partner_organizations%rowtype;
begin
  if not private.is_dorni_super_admin(v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if exists(select 1 from unnest(p_entitlements) x where not exists(select 1 from public.organization_permissions p where p.code=x and p.active)) then raise exception 'INVALID_PERMISSION' using errcode='22023'; end if;
  update public.partner_organizations set institutional_enabled=p_enabled,institutional_enabled_at=case when p_enabled then now() else null end,institutional_enabled_by=case when p_enabled then v_user else null end,updated_at=now() where id=p_organization_id returning * into v_org;
  if v_org.id is null then raise exception 'ORGANIZATION_NOT_FOUND' using errcode='P0002'; end if;
  for v_permission in select code from public.organization_permissions loop
    if p_enabled and v_permission=any(p_entitlements) then
      insert into public.organization_entitlements(organization_id,permission_code,granted_by) values(p_organization_id,v_permission,v_user)
      on conflict (organization_id,permission_code) do update set granted_by=v_user,granted_at=now(),revoked_by=null,revoked_at=null;
      insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
      values(v_user,'ADMIN','ORGANIZATION_ENTITLEMENT_GRANTED','partner_organization',p_organization_id,jsonb_build_object('permissionCode',v_permission));
    else
      update public.organization_entitlements set revoked_by=v_user,revoked_at=now() where organization_id=p_organization_id and permission_code=v_permission and revoked_at is null;
      if found then insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
        values(v_user,'ADMIN','ORGANIZATION_ENTITLEMENT_REVOKED','partner_organization',p_organization_id,jsonb_build_object('permissionCode',v_permission)); end if;
    end if;
  end loop;
  delete from public.organization_role_permissions rp using public.organization_roles r
  where rp.role_id=r.id and r.organization_id=p_organization_id and r.code='PARTNER_ADMIN';
  insert into public.organization_role_permissions(role_id,permission_code,assigned_by)
  select r.id,e.permission_code,v_user from public.organization_roles r
  join public.organization_entitlements e on e.organization_id=r.organization_id and e.revoked_at is null
  where r.organization_id=p_organization_id and r.code='PARTNER_ADMIN'
  on conflict do nothing;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'ADMIN',case when p_enabled then 'INSTITUTIONAL_ACCESS_ENABLED' else 'INSTITUTIONAL_ACCESS_DISABLED' end,'partner_organization',p_organization_id,jsonb_build_object('entitlements',p_entitlements));
  return jsonb_build_object('organizationId',p_organization_id,'enabled',p_enabled,'entitlements',p_entitlements);
end $$;

drop function if exists public.dequeue_notification_messages(text,integer);
create function public.dequeue_notification_messages(p_secret text,p_limit integer default 50)
returns table(id uuid,recipient_id uuid,channel text,template_code text,report_id uuid,institutional_action_id uuid,destination text)
language plpgsql security definer set search_path='' as $$
begin
  if not private.runtime_secret_matches('cron',p_secret) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return query with picked as (
    select m.id from public.notification_messages m where m.status='QUEUED' and m.scheduled_at<=now() order by m.created_at for update skip locked limit greatest(1,least(p_limit,100))
  ), updated as (
    update public.notification_messages m set status='SENDING' from picked where m.id=picked.id returning m.id,m.recipient_id,m.channel,m.template_code,m.report_id,m.institutional_action_id
  ) select u.id,u.recipient_id,u.channel,u.template_code,u.report_id,u.institutional_action_id,case when u.channel='IN_APP' then null else (select c.destination from public.contact_methods c where c.user_id=u.recipient_id and c.kind=u.channel and c.enabled and c.verified_at is not null limit 1) end from updated u;
end $$;

create or replace function public.complete_notification_message(p_secret text,p_message_id uuid,p_provider text,p_reference text,p_status text,p_error_code text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_action uuid; v_transitioned uuid;
begin
  if not private.runtime_secret_matches('cron',p_secret) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_status not in ('SENT','DELIVERED','FAILED') then raise exception 'INVALID_STATUS' using errcode='22023'; end if;
  insert into public.notification_attempts(message_id,provider,provider_reference,status,error_code) values(p_message_id,p_provider,p_reference,p_status,p_error_code);
  update public.notification_messages set status=p_status where id=p_message_id returning institutional_action_id into v_action;
  if v_action is not null and p_status in ('SENT','DELIVERED') then
    update public.institutional_actions set status='DELIVERED',delivered_at=coalesce(delivered_at,now()),updated_at=now() where id=v_action and status='SENT' returning id into v_transitioned;
    if v_transitioned is not null then insert into public.institutional_action_events(action_id,event_type,actor_kind,from_status,to_status,safe_metadata) values(v_action,'NOTIFICATION_DELIVERED','SYSTEM','SENT','DELIVERED',jsonb_build_object('provider',p_provider)); end if;
  end if;
end $$;

-- Every new privileged object is read through scoped RPCs. Direct writes are denied.
create policy organization_permissions_authenticated_read on public.organization_permissions for select to authenticated using (active);
create policy organization_entitlements_scoped_read on public.organization_entitlements for select to authenticated using (private.is_active_org_member(organization_id) or private.is_internal());
create policy organization_roles_scoped_read on public.organization_roles for select to authenticated using (private.is_active_org_member(organization_id) or private.is_internal());
create policy organization_role_permissions_scoped_read on public.organization_role_permissions for select to authenticated using (exists(select 1 from public.organization_roles r where r.id=role_id and (private.is_active_org_member(r.organization_id) or private.is_internal())));
create policy institutional_action_catalog_read on public.institutional_action_types for select to authenticated using (active);
create policy institutional_reason_catalog_read on public.institutional_action_reasons for select to authenticated using (active);
create policy institutional_actions_scoped_read on public.institutional_actions for select to authenticated using (
  private.is_internal() or private.has_org_permission(organization_id,'ORG_REPORT_VIEW') or private.has_org_permission(organization_id,'VEHICLE_MOVE_REQUEST') or exists(select 1 from public.vehicles v where v.id=vehicle_id and v.owner_id=(select auth.uid()))
);
create policy institutional_events_scoped_read on public.institutional_action_events for select to authenticated using (
  exists(select 1 from public.institutional_actions a join public.vehicles v on v.id=a.vehicle_id where a.id=action_id and (v.owner_id=(select auth.uid()) or private.is_internal() or private.has_org_permission(a.organization_id,'ORG_AUDIT_VIEW')))
);

drop policy if exists partner_members_read on public.partner_memberships;
create policy partner_members_read on public.partner_memberships for select to authenticated using (
  user_id=(select auth.uid()) or private.is_internal() or private.has_org_permission(organization_id,'ORG_MEMBER_VIEW')
);

grant select on public.organization_permissions,public.organization_entitlements,public.organization_roles,public.organization_role_permissions,public.institutional_action_types,public.institutional_action_reasons,public.institutional_actions,public.institutional_action_events to authenticated;
grant usage,select on sequence public.dorni_institutional_reference to service_role;
revoke all on function private.is_active_org_member(uuid,uuid),private.has_org_permission(uuid,text,uuid),private.is_dorni_super_admin(uuid),private.ensure_default_organization_roles(),private.sync_partner_membership_role() from public,anon,authenticated;
grant execute on function private.is_active_org_member(uuid,uuid),private.has_org_permission(uuid,text,uuid),private.is_dorni_super_admin(uuid) to authenticated,service_role;

revoke all on function public.get_my_account_context(),public.get_institutional_scan_context(text,uuid),public.create_institutional_move_request(uuid,text,text,text,text),public.respond_to_institutional_action(uuid,text),public.get_owner_institutional_actions(),public.get_organization_institutional_overview(uuid,timestamptz,timestamptz),public.org_upsert_role(uuid,uuid,text,text,text[]),public.org_invite_member(uuid,text,uuid,text),public.claim_partner_invitation(text),public.org_set_member_status(uuid,uuid,text),public.admin_set_institutional_access(uuid,boolean,text[]) from public,anon,authenticated;
grant execute on function public.get_my_account_context(),public.get_institutional_scan_context(text,uuid),public.create_institutional_move_request(uuid,text,text,text,text),public.respond_to_institutional_action(uuid,text),public.get_owner_institutional_actions(),public.get_organization_institutional_overview(uuid,timestamptz,timestamptz),public.org_upsert_role(uuid,uuid,text,text,text[]),public.org_invite_member(uuid,text,uuid,text),public.claim_partner_invitation(text),public.org_set_member_status(uuid,uuid,text),public.admin_set_institutional_access(uuid,boolean,text[]) to authenticated;

-- Worker RPCs use the service role. They are no longer general anon/auth endpoints.
revoke execute on function public.dequeue_notification_messages(text,integer),public.complete_notification_message(text,uuid,text,text,text,text) from anon,authenticated;
grant execute on function public.dequeue_notification_messages(text,integer),public.complete_notification_message(text,uuid,text,text,text,text) to service_role;

commit;
