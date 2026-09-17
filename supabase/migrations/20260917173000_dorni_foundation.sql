begin;

create extension if not exists pgcrypto;
create schema if not exists private;
create sequence if not exists public.dorni_batch_number start 1000;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text not null,
  locale text not null default 'ar' check (locale in ('ar','en')),
  account_status text not null default 'ACTIVE' check (account_status in ('ACTIVE','SUSPENDED','DELETION_REQUESTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contact_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('PRIMARY_PHONE','WHATSAPP','SMS','PUSH')),
  destination text not null,
  verified_at timestamptz,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, kind, destination)
);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  primary_channel text not null default 'IN_APP' check (primary_channel in ('IN_APP','WEB_PUSH','WHATSAPP','SMS')),
  fallback_channel text check (fallback_channel in ('IN_APP','WEB_PUSH','WHATSAPP','SMS')),
  push_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  sms_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  manufacturer text not null check (char_length(manufacturer) between 1 and 80),
  model text not null check (char_length(model) between 1 and 80),
  color text not null check (char_length(color) between 1 and 40),
  nickname text check (char_length(nickname) <= 80),
  year smallint check (year between 1950 and 2100),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('INSURANCE','CORPORATE','DISTRIBUTOR','OTHER')),
  status text not null default 'PENDING' check (status in ('PENDING','ACTIVE','SUSPENDED')),
  trusted_generation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.partner_organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('PARTNER_ADMIN','PARTNER_OPERATOR','PARTNER_VIEWER')),
  status text not null default 'ACTIVE' check (status in ('INVITED','ACTIVE','SUSPENDED')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.partner_organizations(id),
  name text not null,
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','ENDED')),
  created_at timestamptz not null default now()
);

create table public.code_batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text not null unique,
  organization_id uuid references public.partner_organizations(id),
  campaign_id uuid references public.campaigns(id),
  product_type text not null default 'STANDARD_CARD',
  quantity integer not null check (quantity between 1 and 100000),
  generation_status text not null default 'PENDING' check (generation_status in ('PENDING','APPROVED','GENERATING','COMPLETED','FAILED','REJECTED')),
  production_status text not null default 'NOT_STARTED' check (production_status in ('NOT_STARTED','EXPORTED','PRODUCED')),
  distribution_status text not null default 'NOT_STARTED' check (distribution_status in ('NOT_STARTED','PARTIAL','DISTRIBUTED')),
  requested_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  idempotency_key text unique,
  generated_count integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.partner_batch_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.partner_organizations(id),
  requested_by uuid not null references public.profiles(id),
  quantity integer not null check (quantity between 1 and 100000),
  product_type text not null default 'STANDARD_CARD',
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','FULFILLED')),
  notes text check (char_length(notes) <= 1000),
  batch_id uuid references public.code_batches(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table public.codes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.code_batches(id),
  serial_number text not null unique,
  public_token text not null unique,
  product_type text not null default 'STANDARD_CARD',
  production_state text not null default 'PROVISIONED' check (production_state in ('PROVISIONED','PRODUCED','IN_STOCK','DISTRIBUTED')),
  ownership_state text not null default 'UNCLAIMED' check (ownership_state in ('UNCLAIMED','CLAIMED')),
  activation_state text not null default 'INACTIVE' check (activation_state in ('INACTIVE','ACTIVE','SUSPENDED','REVOKED','REPLACED')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.code_claims (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null unique references public.codes(id) on delete cascade,
  credential_hash text not null unique,
  claimed_by uuid references public.profiles(id),
  claimed_at timestamptz,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table public.code_assignments (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.codes(id),
  vehicle_id uuid not null references public.vehicles(id),
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text
);
create unique index code_assignments_one_active_code on public.code_assignments(code_id) where ended_at is null;
create unique index code_assignments_one_active_vehicle on public.code_assignments(vehicle_id) where ended_at is null;

create table public.code_replacements (
  id uuid primary key default gen_random_uuid(),
  old_code_id uuid not null unique references public.codes(id),
  new_code_id uuid not null unique references public.codes(id),
  replaced_by uuid not null references public.profiles(id),
  reason text not null,
  created_at timestamptz not null default now(),
  check (old_code_id <> new_code_id)
);

create table public.distribution_events (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.codes(id),
  organization_id uuid references public.partner_organizations(id),
  event_type text not null check (event_type in ('ALLOCATED','EXPORTED','PRODUCED','DISTRIBUTED','RETURNED')),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table public.report_types (
  code text primary key,
  label_ar text not null,
  label_en text not null,
  description_ar text,
  icon text not null,
  severity smallint not null default 1 check (severity between 1 and 5),
  is_active boolean not null default true,
  display_order smallint not null
);

create table public.scanner_sessions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.codes(id),
  session_hash text not null unique,
  ip_hash text,
  user_agent_hash text,
  blocked_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.codes(id),
  vehicle_id uuid not null references public.vehicles(id),
  scanner_session_id uuid not null references public.scanner_sessions(id),
  report_type_code text not null references public.report_types(code),
  status text not null default 'ACTIVE' check (status in ('CREATED','ACTIVE','ACKNOWLEDGED','RESOLVED','EXPIRED','BLOCKED')),
  owner_response text check (owner_response in ('ON_MY_WAY','RESOLVED','CANNOT_REACH_NOW')),
  status_token_hash text not null unique,
  latitude numeric(9,6),
  longitude numeric(9,6),
  location_expires_at timestamptz,
  duplicate_count integer not null default 1,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_vehicle_status_created on public.reports(vehicle_id, status, created_at desc);

create table public.report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  event_type text not null,
  actor_id uuid references public.profiles(id),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notification_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id),
  recipient_id uuid not null references public.profiles(id),
  channel text not null check (channel in ('IN_APP','WEB_PUSH','WHATSAPP','SMS')),
  template_code text not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','SENDING','SENT','DELIVERED','FAILED','CANCELLED')),
  scheduled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_attempts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.notification_messages(id) on delete cascade,
  provider text not null,
  provider_reference text,
  status text not null check (status in ('SENDING','SENT','DELIVERED','FAILED')),
  error_code text,
  attempted_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id),
  organization_id uuid references public.partner_organizations(id),
  category text not null,
  subject text not null,
  description text not null,
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  vehicle_id uuid references public.vehicles(id),
  code_id uuid references public.codes(id),
  report_id uuid references public.reports(id),
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 4000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.terms_versions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('TERMS','PRIVACY','PARTNER_TERMS')),
  version text not null,
  locale text not null check (locale in ('ar','en')),
  content_md text not null,
  published_at timestamptz not null default now(),
  unique (kind, version, locale)
);

create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  terms_version_id uuid not null references public.terms_versions(id),
  accepted_at timestamptz not null default now(),
  unique (user_id, terms_version_id)
);

create table public.internal_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role_code text not null check (role_code in ('SUPER_ADMIN','OPERATIONS','CODE_PRODUCTION','PARTNER_MANAGER','SUPPORT','SECURITY_REVIEW','ANALYTICS_VIEWER')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  actor_kind text not null check (actor_kind in ('OWNER','PARTNER','ADMIN','SYSTEM','ANONYMOUS')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.abuse_events (
  id uuid primary key default gen_random_uuid(),
  code_id uuid references public.codes(id),
  scanner_session_id uuid references public.scanner_sessions(id),
  kind text not null,
  score integer not null default 0,
  action text not null check (action in ('OBSERVED','THROTTLED','CHALLENGED','BLOCKED')),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.production_exports (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.code_batches(id),
  storage_path text not null,
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id),
  downloaded_at timestamptz,
  created_at timestamptz not null default now()
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('production-exports','production-exports',false,10485760,array['text/csv'])
on conflict (id) do nothing;

create or replace function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated before update on public.profiles for each row execute function private.touch_updated_at();
create trigger vehicles_updated before update on public.vehicles for each row execute function private.touch_updated_at();
create trigger partners_updated before update on public.partner_organizations for each row execute function private.touch_updated_at();
create trigger reports_updated before update on public.reports for each row execute function private.touch_updated_at();
create trigger messages_updated before update on public.notification_messages for each row execute function private.touch_updated_at();
create trigger tickets_updated before update on public.support_tickets for each row execute function private.touch_updated_at();

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, phone) values (new.id, coalesce(new.phone, ''));
  insert into public.notification_preferences(user_id) values (new.id);
  if new.phone is not null then
    insert into public.contact_methods(user_id, kind, destination, verified_at) values (new.id, 'PRIMARY_PHONE', new.phone, now());
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create or replace function private.is_partner_member(org_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.partner_memberships m where m.organization_id=org_id and m.user_id=(select auth.uid()) and m.status='ACTIVE')
$$;
create or replace function private.is_partner_admin(org_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.partner_memberships m where m.organization_id=org_id and m.user_id=(select auth.uid()) and m.status='ACTIVE' and m.role='PARTNER_ADMIN')
$$;
create or replace function private.is_internal() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.internal_memberships i where i.user_id=(select auth.uid()) and i.active)
$$;

create or replace function public.claim_dorni_code(p_serial_number text, p_credential_hash text, p_vehicle_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_code uuid; v_claim public.code_claims%rowtype; v_assignment uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.vehicles where id=p_vehicle_id and owner_id=v_user and archived_at is null) then raise exception 'VEHICLE_NOT_FOUND' using errcode='P0002'; end if;
  select c.id into v_code from public.codes c where c.serial_number=upper(trim(p_serial_number)) and c.ownership_state='UNCLAIMED' and c.activation_state='INACTIVE' for update;
  if v_code is null then raise exception 'CODE_NOT_AVAILABLE' using errcode='P0002'; end if;
  select * into v_claim from public.code_claims where code_id=v_code for update;
  if v_claim.claimed_at is not null then raise exception 'CLAIM_ALREADY_USED' using errcode='23505'; end if;
  if v_claim.locked_until is not null and v_claim.locked_until > now() then raise exception 'CLAIM_LOCKED' using errcode='42501'; end if;
  if v_claim.credential_hash <> p_credential_hash then
    update public.code_claims set failed_attempts=failed_attempts+1, locked_until=case when failed_attempts+1>=5 then now()+interval '30 minutes' else locked_until end where id=v_claim.id;
    raise exception 'INVALID_CLAIM' using errcode='22023';
  end if;
  update public.code_claims set claimed_by=v_user, claimed_at=now() where id=v_claim.id and claimed_at is null;
  if not found then raise exception 'CLAIM_ALREADY_USED' using errcode='23505'; end if;
  update public.codes set ownership_state='CLAIMED', activation_state='ACTIVE' where id=v_code;
  update public.code_assignments set ended_at=now(), end_reason='MOVED' where vehicle_id=p_vehicle_id and ended_at is null;
  insert into public.code_assignments(code_id,vehicle_id,assigned_by) values(v_code,p_vehicle_id,v_user) returning id into v_assignment;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id) values(v_user,'OWNER','CODE_CLAIMED','code',v_code);
  return v_assignment;
end $$;

create or replace function public.get_public_code(p_public_token text)
returns table(code_id uuid, manufacturer text, model text, color text) language sql stable security definer set search_path = '' as $$
  select c.id, v.manufacturer, v.model, v.color
  from public.codes c join public.code_assignments a on a.code_id=c.id and a.ended_at is null join public.vehicles v on v.id=a.vehicle_id
  where c.public_token=p_public_token and c.activation_state='ACTIVE' and v.archived_at is null limit 1
$$;

create or replace function public.submit_public_report(p_public_token text,p_report_type text,p_session_hash text,p_status_token_hash text,p_ip_hash text default null,p_latitude numeric default null,p_longitude numeric default null)
returns table(report_id uuid, aggregated boolean) language plpgsql security definer set search_path = '' as $$
declare v_code uuid; v_vehicle uuid; v_session uuid; v_report uuid; v_recent uuid;
begin
  select c.id,a.vehicle_id into v_code,v_vehicle from public.codes c join public.code_assignments a on a.code_id=c.id and a.ended_at is null where c.public_token=p_public_token and c.activation_state='ACTIVE' for share;
  if v_code is null then raise exception 'CODE_NOT_ACTIVE' using errcode='P0002'; end if;
  if not exists(select 1 from public.report_types where code=p_report_type and is_active) then raise exception 'INVALID_REPORT_TYPE' using errcode='22023'; end if;
  if exists(select 1 from public.scanner_sessions where session_hash=p_session_hash and created_at>now()-interval '1 minute') then raise exception 'RATE_LIMITED' using errcode='P0001'; end if;
  select r.id into v_recent from public.reports r where r.code_id=v_code and r.report_type_code=p_report_type and r.status in ('ACTIVE','ACKNOWLEDGED') and r.created_at>now()-interval '5 minutes' order by r.created_at desc limit 1 for update;
  insert into public.scanner_sessions(code_id,session_hash,ip_hash,expires_at) values(v_code,p_session_hash,p_ip_hash,now()+interval '72 hours') returning id into v_session;
  if v_recent is not null then
    update public.reports set duplicate_count=duplicate_count+1 where id=v_recent;
    insert into public.report_events(report_id,event_type,safe_metadata) values(v_recent,'REPORT_AGGREGATED',jsonb_build_object('count',1));
    return query select v_recent,true; return;
  end if;
  insert into public.reports(code_id,vehicle_id,scanner_session_id,report_type_code,status,status_token_hash,latitude,longitude,location_expires_at,expires_at)
  values(v_code,v_vehicle,v_session,p_report_type,'ACTIVE',p_status_token_hash,p_latitude,p_longitude,case when p_latitude is not null then now()+interval '24 hours' end,now()+interval '72 hours') returning id into v_report;
  insert into public.report_events(report_id,event_type) values(v_report,'REPORT_CREATED');
  insert into public.notification_messages(report_id,recipient_id,channel,template_code)
  select v_report,v.owner_id,'IN_APP','REPORT_CREATED' from public.vehicles v where v.id=v_vehicle;
  insert into public.notification_messages(report_id,recipient_id,channel,template_code)
  select v_report,v.owner_id,n.primary_channel,'REPORT_CREATED' from public.vehicles v join public.notification_preferences n on n.user_id=v.owner_id where v.id=v_vehicle and n.primary_channel<>'IN_APP';
  return query select v_report,false;
end $$;

create or replace function public.get_public_report_status(p_status_token_hash text)
returns table(report_type_code text,status text,owner_response text,created_at timestamptz,updated_at timestamptz,expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select r.report_type_code,r.status,r.owner_response,r.created_at,r.updated_at,r.expires_at from public.reports r where r.status_token_hash=p_status_token_hash and r.expires_at>now() limit 1
$$;

create or replace function public.respond_to_report(p_report_id uuid, p_response text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_status text; v_event text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_response not in ('ON_MY_WAY','RESOLVED','CANNOT_REACH_NOW') then raise exception 'INVALID_RESPONSE' using errcode='22023'; end if;
  if not exists(select 1 from public.reports r join public.vehicles v on v.id=r.vehicle_id where r.id=p_report_id and v.owner_id=v_user) then raise exception 'REPORT_NOT_FOUND' using errcode='P0002'; end if;
  v_status := case when p_response='RESOLVED' then 'RESOLVED' else 'ACKNOWLEDGED' end;
  v_event := case p_response when 'ON_MY_WAY' then 'OWNER_ON_MY_WAY' when 'RESOLVED' then 'REPORT_RESOLVED' else 'OWNER_CANNOT_REACH' end;
  update public.reports set owner_response=p_response,status=v_status where id=p_report_id;
  insert into public.report_events(report_id,event_type,actor_id) values(p_report_id,v_event,v_user);
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id) values(v_user,'OWNER','REPORT_RESPONDED','report',p_report_id);
end $$;

create or replace function public.create_code_batch(p_organization_id uuid,p_product_type text,p_idempotency_key text,p_codes jsonb)
returns table(batch_id uuid,batch_code text,created_count integer) language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_batch uuid; v_code_id uuid; v_batch_code text; v_item jsonb; v_count integer := jsonb_array_length(p_codes);
begin
  if v_user is null or not exists(select 1 from public.internal_memberships where user_id=v_user and active and role_code in ('SUPER_ADMIN','OPERATIONS','CODE_PRODUCTION')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if v_count<1 or v_count>1000 then raise exception 'INVALID_BATCH_SIZE' using errcode='22023'; end if;
  if p_organization_id is not null and not exists(select 1 from public.partner_organizations where id=p_organization_id and status='ACTIVE') then raise exception 'PARTNER_NOT_ACTIVE' using errcode='22023'; end if;
  select id,code_batches.batch_code into v_batch,v_batch_code from public.code_batches where idempotency_key=p_idempotency_key;
  if v_batch is not null then return query select v_batch,v_batch_code,(select generated_count from public.code_batches where id=v_batch); return; end if;
  v_batch_code := 'DOR-'||to_char(now(),'YY')||'-'||lpad(nextval('public.dorni_batch_number')::text,6,'0');
  insert into public.code_batches(batch_code,organization_id,product_type,quantity,generation_status,requested_by,approved_by,idempotency_key)
  values(v_batch_code,p_organization_id,p_product_type,v_count,'GENERATING',v_user,v_user,p_idempotency_key) returning id into v_batch;
  for v_item in select * from jsonb_array_elements(p_codes) loop
    insert into public.codes(batch_id,serial_number,public_token,product_type) values(v_batch,v_item->>'serialNumber',v_item->>'publicToken',p_product_type)
    returning id into v_code_id;
    insert into public.code_claims(code_id,credential_hash) values(v_code_id,v_item->>'credentialHash');
  end loop;
  update public.code_batches set generation_status='COMPLETED',generated_count=v_count,completed_at=now() where id=v_batch;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(v_user,'ADMIN','BATCH_GENERATED','code_batch',v_batch,jsonb_build_object('quantity',v_count));
  return query select v_batch,v_batch_code,v_count;
end $$;

revoke all on function public.claim_dorni_code(text,text,uuid), public.get_public_code(text), public.submit_public_report(text,text,text,text,text,numeric,numeric), public.get_public_report_status(text), public.respond_to_report(uuid,text), public.create_code_batch(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.claim_dorni_code(text,text,uuid) to authenticated;
grant execute on function public.respond_to_report(uuid,text) to authenticated;
grant execute on function public.create_code_batch(uuid,text,text,jsonb) to authenticated;
grant execute on function public.get_public_code(text), public.submit_public_report(text,text,text,text,text,numeric,numeric), public.get_public_report_status(text) to anon, authenticated;
grant execute on function public.claim_dorni_code(text,text,uuid), public.get_public_code(text), public.submit_public_report(text,text,text,text,text,numeric,numeric), public.get_public_report_status(text), public.respond_to_report(uuid,text), public.create_code_batch(uuid,text,text,jsonb) to service_role;

revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.is_partner_member(uuid), private.is_partner_admin(uuid), private.is_internal() to authenticated;

insert into public.report_types(code,label_ar,label_en,description_ar,icon,severity,display_order) values
('BLOCKING_EXIT','السيارة تعيق خروجي','Blocking my exit','السيارة تمنع مركبة أخرى من الخروج','move-right',3,1),
('PLEASE_MOVE','الرجاء تحريك السيارة','Please move the vehicle','طلب تحريك السيارة','car-front',2,2),
('LIGHTS_ON','الأنوار ما زالت شغالة','Lights are on','تنبيه بخصوص الأنوار','lightbulb',1,3),
('DOOR_OR_WINDOW_OPEN','باب أو نافذة مفتوحة','Door or window open','تنبيه أمني للسيارة','door-open',3,4),
('VEHICLE_DAMAGE','هناك ضرر أو مشكلة بالسيارة','Vehicle damage','ضرر ظاهر أو مشكلة','triangle-alert',4,5),
('URGENT_ATTENTION','تنبيه عاجل','Urgent attention','حالة تستدعي الانتباه السريع','circle-alert',5,6);

do $$ declare t text; begin
  foreach t in array array['profiles','contact_methods','notification_preferences','vehicles','partner_organizations','partner_memberships','campaigns','code_batches','partner_batch_requests','codes','code_claims','code_assignments','code_replacements','distribution_events','report_types','scanner_sessions','reports','report_events','notification_messages','notification_attempts','support_tickets','support_messages','terms_versions','terms_acceptances','internal_memberships','audit_logs','abuse_events','production_exports']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

create policy profiles_self_select on public.profiles for select to authenticated using ((select auth.uid())=id or private.is_internal());
create policy profiles_self_update on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy contacts_owner_all on public.contact_methods for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy prefs_owner_all on public.notification_preferences for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy vehicles_owner_select on public.vehicles for select to authenticated using ((select auth.uid())=owner_id or private.is_internal());
create policy vehicles_owner_insert on public.vehicles for insert to authenticated with check ((select auth.uid())=owner_id);
create policy vehicles_owner_update on public.vehicles for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy report_types_public_read on public.report_types for select to anon, authenticated using (is_active);
create policy owner_assignments_read on public.code_assignments for select to authenticated using (exists(select 1 from public.vehicles v where v.id=vehicle_id and v.owner_id=(select auth.uid())) or private.is_internal());
create policy owner_codes_read on public.codes for select to authenticated using (exists(select 1 from public.code_assignments a join public.vehicles v on v.id=a.vehicle_id where a.code_id=codes.id and a.ended_at is null and v.owner_id=(select auth.uid())) or private.is_internal());
create policy owner_reports_read on public.reports for select to authenticated using (exists(select 1 from public.vehicles v where v.id=vehicle_id and v.owner_id=(select auth.uid())) or private.is_internal());
create policy owner_reports_update on public.reports for update to authenticated using (exists(select 1 from public.vehicles v where v.id=vehicle_id and v.owner_id=(select auth.uid())) or private.is_internal()) with check (exists(select 1 from public.vehicles v where v.id=vehicle_id and v.owner_id=(select auth.uid())) or private.is_internal());
create policy owner_events_read on public.report_events for select to authenticated using (exists(select 1 from public.reports r join public.vehicles v on v.id=r.vehicle_id where r.id=report_id and v.owner_id=(select auth.uid())) or private.is_internal());
create policy owner_notifications_read on public.notification_messages for select to authenticated using (recipient_id=(select auth.uid()) or private.is_internal());
create policy support_requester_read on public.support_tickets for select to authenticated using (requester_id=(select auth.uid()) or (organization_id is not null and private.is_partner_member(organization_id)) or private.is_internal());
create policy support_requester_insert on public.support_tickets for insert to authenticated with check (requester_id=(select auth.uid()) and (organization_id is null or private.is_partner_member(organization_id)));
create policy support_requester_update on public.support_tickets for update to authenticated using (requester_id=(select auth.uid()) or private.is_internal()) with check (requester_id=(select auth.uid()) or private.is_internal());
create policy support_messages_read on public.support_messages for select to authenticated using (exists(select 1 from public.support_tickets t where t.id=ticket_id and (t.requester_id=(select auth.uid()) or (t.organization_id is not null and private.is_partner_member(t.organization_id)) or private.is_internal())) and (not is_internal or private.is_internal()));
create policy support_messages_insert on public.support_messages for insert to authenticated with check (author_id=(select auth.uid()) and exists(select 1 from public.support_tickets t where t.id=ticket_id and (t.requester_id=(select auth.uid()) or (t.organization_id is not null and private.is_partner_member(t.organization_id)) or private.is_internal())));
create policy partner_org_read on public.partner_organizations for select to authenticated using (private.is_partner_member(id) or private.is_internal());
create policy partner_members_read on public.partner_memberships for select to authenticated using (user_id=(select auth.uid()) or private.is_partner_member(organization_id) or private.is_internal());
create policy partner_requests_read on public.partner_batch_requests for select to authenticated using (private.is_partner_member(organization_id) or private.is_internal());
create policy partner_requests_insert on public.partner_batch_requests for insert to authenticated with check (requested_by=(select auth.uid()) and private.is_partner_member(organization_id));
create policy batches_partner_read on public.code_batches for select to authenticated using ((organization_id is not null and private.is_partner_member(organization_id)) or private.is_internal());
create policy campaigns_partner_read on public.campaigns for select to authenticated using ((organization_id is not null and private.is_partner_member(organization_id)) or private.is_internal());
create policy acceptances_self on public.terms_acceptances for select to authenticated using (user_id=(select auth.uid()) or private.is_internal());
create policy acceptances_insert on public.terms_acceptances for insert to authenticated with check (user_id=(select auth.uid()));
create policy terms_read on public.terms_versions for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on public.report_types, public.terms_versions to anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.contact_methods, public.notification_preferences, public.vehicles to authenticated;
grant select on public.codes, public.code_assignments, public.reports, public.report_events, public.notification_messages, public.partner_organizations, public.partner_memberships, public.code_batches, public.campaigns to authenticated;
grant select, insert, update on public.support_tickets, public.support_messages, public.partner_batch_requests, public.terms_acceptances to authenticated;
grant select on public.report_types, public.terms_versions to authenticated;
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

commit;
