-- Production target schema excerpt. Migrations must append from this reviewed baseline.
create extension if not exists pgcrypto;

create type code_production_state as enum ('PROVISIONED','PRODUCED','IN_STOCK','DISTRIBUTED');
create type code_claim_state as enum ('UNCLAIMED','CLAIMED');
create type code_activation_state as enum ('INACTIVE','ACTIVE','SUSPENDED','REVOKED','REPLACED');
create type report_state as enum ('CREATED','ACTIVE','ACKNOWLEDGED','RESOLVED','EXPIRED','BLOCKED');

create table users (
  id uuid primary key default gen_random_uuid(),
  normalized_phone text not null unique,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id),
  manufacturer text not null,
  model text not null,
  color text not null,
  nickname text,
  year smallint,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_vehicles_owner_active on vehicles(owner_user_id) where archived_at is null;

create table code_batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text not null unique,
  partner_organization_id uuid,
  requested_quantity integer not null check (requested_quantity between 1 and 100000),
  generated_quantity integer not null default 0,
  idempotency_key text not null unique,
  generation_status text not null,
  created_at timestamptz not null default now()
);

create table codes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references code_batches(id),
  serial_number text not null unique,
  public_token text not null unique,
  claim_digest text unique,
  production_state code_production_state not null default 'PROVISIONED',
  claim_state code_claim_state not null default 'UNCLAIMED',
  activation_state code_activation_state not null default 'INACTIVE',
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  check ((claim_state = 'UNCLAIMED' and claim_digest is not null) or claim_state = 'CLAIMED')
);
create index idx_codes_batch_states on codes(batch_id, activation_state, claim_state);

create table code_assignments (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references codes(id),
  vehicle_id uuid not null references vehicles(id),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index uq_code_open_assignment on code_assignments(code_id) where ended_at is null;

create table report_types (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  label_ar text not null, label_en text not null, severity smallint not null,
  is_active boolean not null default true, display_order integer not null
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references codes(id),
  vehicle_id uuid not null references vehicles(id),
  report_type_id uuid not null references report_types(id),
  status report_state not null default 'CREATED',
  status_token_digest text not null unique,
  status_token_expires_at timestamptz not null,
  duplicate_key text not null,
  aggregate_count integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index idx_reports_vehicle_active on reports(vehicle_id, created_at desc) where status in ('CREATED','ACTIVE','ACKNOWLEDGED');

create table report_events (
  id uuid primary key default gen_random_uuid(), report_id uuid not null references reports(id),
  event_type text not null, safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_report_events_timeline on report_events(report_id, created_at);

create table audit_logs (
  id uuid primary key default gen_random_uuid(), actor_type text not null, actor_id uuid,
  action text not null, entity_type text not null, entity_id uuid,
  safe_metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index idx_audit_entity_time on audit_logs(entity_type, entity_id, created_at desc);
