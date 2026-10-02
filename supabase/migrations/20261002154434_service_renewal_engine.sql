begin;
create table public.service_plans(
 id uuid primary key default gen_random_uuid(), code text not null unique check(code ~ '^[A-Z][A-Z0-9_]{2,60}$'),
 name text not null check(length(name) between 1 and 120), active boolean not null default true
);
create table public.service_plan_versions(
 id uuid primary key default gen_random_uuid(),plan_id uuid not null references public.service_plans(id),
 version integer not null check(version>0),duration_unit text not null check(duration_unit in ('DAYS','MONTHS')),
 duration_value integer not null check(duration_value between 1 and 3660),created_at timestamptz not null default clock_timestamp(),
 unique(plan_id,version)
);
create table public.service_prices(
 id uuid primary key default gen_random_uuid(),plan_version_id uuid not null references public.service_plan_versions(id),
 amount_minor bigint not null check(amount_minor>=0),currency text not null check(currency ~ '^[A-Z]{3}$'),
 created_at timestamptz not null default clock_timestamp()
);
create table private.service_defaults(singleton boolean primary key default true check(singleton),initial_plan_version_id uuid not null references public.service_plan_versions(id));
insert into public.service_plans(code,name) values('TRIAL_15_DAYS','تجربة 15 يومًا'),('MONTHLY','شهر'),('SIX_MONTHS','6 أشهر'),('ANNUAL','سنة');
insert into public.service_plan_versions(plan_id,version,duration_unit,duration_value)
 select id,1,case when code='TRIAL_15_DAYS' then 'DAYS' else 'MONTHS' end,
 case code when 'TRIAL_15_DAYS' then 15 when 'MONTHLY' then 1 when 'SIX_MONTHS' then 6 else 12 end from public.service_plans;
insert into private.service_defaults(initial_plan_version_id) select v.id from public.service_plan_versions v join public.service_plans p on p.id=v.plan_id where p.code='TRIAL_15_DAYS';
alter table public.codes add column initial_plan_version_id uuid references public.service_plan_versions(id);
-- LEGACY is never assigned terms. Pre-existing local MANAGED test stock may be
-- pinned to the configured version only while unclaimed; deployed legacy is untouched.
update public.codes set initial_plan_version_id=(select initial_plan_version_id from private.service_defaults)
 where service_policy='MANAGED' and ownership_state='UNCLAIMED';
do $$ begin if exists(select 1 from public.codes where service_policy='MANAGED' and ownership_state='CLAIMED') then
 raise exception 'MANAGED_ALREADY_CLAIMED_REQUIRES_RECONCILIATION'; end if; end $$;

create table public.endpoint_services(
 id uuid primary key default gen_random_uuid(),current_code_id uuid not null unique references public.codes(id),
 legacy_entitlement boolean not null default false,created_at timestamptz not null default clock_timestamp()
);
create table public.service_orders(
 id uuid primary key default gen_random_uuid(),service_id uuid not null references public.endpoint_services(id),
 plan_version_id uuid not null references public.service_plan_versions(id),price_id uuid references public.service_prices(id),
 source text not null check(source in ('MANUAL_ADMIN','PAYMENT_PROVIDER')),provider text not null,
 purpose text not null check(purpose in ('RENEWAL','MANUAL_EXTENSION','PLAN_CHANGE')),
 request_key text not null unique check(length(request_key) between 16 and 160),
 reason text not null check(length(reason) between 3 and 500),approved_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 check((source='MANUAL_ADMIN' and provider='ADMIN') or (source='PAYMENT_PROVIDER' and provider<>'ADMIN' and price_id is not null))
);
create table public.service_periods(
 id uuid primary key default gen_random_uuid(),service_id uuid not null references public.endpoint_services(id),
 code_id uuid not null references public.codes(id),plan_version_id uuid not null references public.service_plan_versions(id),
 order_id uuid unique references public.service_orders(id),kind text not null check(kind in ('ACTIVATION','RENEWAL','MANUAL_EXTENSION','PLAN_CHANGE')),
 starts_at timestamptz not null,ends_at timestamptz not null,confirmed_at timestamptz not null,
 anchor_day integer not null check(anchor_day between 1 and 31),check(ends_at>starts_at)
);
create unique index service_period_activation_once on public.service_periods(service_id) where kind='ACTIVATION';
create index service_periods_timeline on public.service_periods(service_id,ends_at desc);
create table public.service_confirmations(
 id uuid primary key default gen_random_uuid(),order_id uuid not null unique references public.service_orders(id),
 source text not null,provider text not null,external_reference text not null check(length(external_reference) between 1 and 200),
 confirmed_at timestamptz not null,unique(source,provider,external_reference)
);
create table public.service_transfers(
 id uuid primary key default gen_random_uuid(),service_id uuid not null references public.endpoint_services(id),
 from_code_id uuid not null unique references public.codes(id),to_code_id uuid not null unique references public.codes(id),
 actor_id uuid not null references public.profiles(id),reason text not null,request_key text not null unique,
 transferred_at timestamptz not null default clock_timestamp(),check(from_code_id<>to_code_id)
);
-- History and version definitions are append-only, even for normal privileged RPCs.
create function private.service_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'SERVICE_HISTORY_IMMUTABLE';end$$;
do $$ declare t text; begin
 foreach t in array array['service_plan_versions','service_prices','service_orders','service_periods','service_confirmations','service_transfers'] loop
  execute format('create trigger service_immutable before update or delete on public.%I for each row execute function private.service_immutable()',t);
 end loop;
 foreach t in array array['service_plans','service_plan_versions','service_prices','endpoint_services','service_orders','service_periods','service_confirmations','service_transfers'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end$$;
alter table private.service_defaults enable row level security;
revoke all on private.service_defaults from public,anon,authenticated;
revoke all on function private.service_immutable() from public,anon,authenticated;

-- UTC calendar math. Retain the original day across continuous monthly renewals
-- (Jan 31 -> Feb 28/29 -> Mar 31), not a hard-coded number of seconds per month.
create function private.service_end(p_start timestamptz,p_unit text,p_value integer,p_anchor integer) returns timestamptz
language plpgsql immutable set search_path='' as $$
declare d timestamp:=p_start at time zone 'UTC'; target timestamp; last_day integer;
begin
 if p_start is null or not isfinite(p_start) or p_value is null or p_value not between 1 and 3660 or p_anchor is null or p_anchor not between 1 and 31 then raise exception 'INVALID_DURATION';end if;
 if p_unit='DAYS' then return (d+make_interval(days=>p_value)) at time zone 'UTC';end if;
 if p_unit<>'MONTHS' or p_unit is null then raise exception 'INVALID_DURATION';end if;
 target:=date_trunc('month',d)+make_interval(months=>p_value);
 last_day:=extract(day from target+interval '1 month - 1 day');
 return (target+make_interval(days=>least(p_anchor,last_day)-1)+(d-date_trunc('day',d))) at time zone 'UTC';
end$$;
revoke all on function private.service_end(timestamptz,text,integer,integer) from public,anon,authenticated;

create function private.service_admin() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=private.commercial_user();begin
 if not exists(select 1 from public.internal_memberships where user_id=u and active and role_code='SUPER_ADMIN') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 return u;
end$$;
revoke all on function private.service_admin() from public,anon,authenticated;

create function private.pin_initial_service() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.service_policy='LEGACY' then
  if new.initial_plan_version_id is not null then raise exception 'LEGACY_HAS_NO_PLAN';end if;
 elsif tg_op='INSERT' and new.initial_plan_version_id is null then
  select initial_plan_version_id into new.initial_plan_version_id from private.service_defaults;
 end if;
 if tg_op='INSERT' and new.service_policy='MANAGED' and not exists(select 1 from public.service_plan_versions v join public.service_plans p on p.id=v.plan_id where v.id=new.initial_plan_version_id and p.active) then raise exception 'DEFAULT_PLAN_UNAVAILABLE';end if;
 if tg_op='UPDATE' and old.ownership_state='CLAIMED' and new.initial_plan_version_id is distinct from old.initial_plan_version_id then raise exception 'INITIAL_PLAN_ALREADY_USED';end if;
 return new;
end$$;
create trigger pin_initial_service before insert or update on public.codes for each row execute function private.pin_initial_service();
revoke all on function private.pin_initial_service() from public,anon,authenticated;

create function private.start_endpoint_service() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;v public.service_plan_versions%rowtype;t timestamptz;anchor integer;finish timestamptz;
begin
 if new.ownership_state<>'CLAIMED' or old.ownership_state='CLAIMED' or new.service_policy='LEGACY' then return new;end if;
 -- Administrative replacement pre-binds the existing service; no new trial.
 if exists(select 1 from public.endpoint_services where current_code_id=new.id) then return new;end if;
 select * into v from public.service_plan_versions where id=new.initial_plan_version_id;
 if not found then raise exception 'INITIAL_PLAN_REQUIRED';end if;
 t:=new.first_activated_at;
 if t is null then raise exception 'CLAIM_TIMESTAMP_REQUIRED';end if;
 anchor:=extract(day from t at time zone 'UTC');finish:=private.service_end(t,v.duration_unit,v.duration_value,anchor);
 insert into public.endpoint_services(current_code_id) values(new.id) returning id into sid;
 insert into public.service_periods(service_id,code_id,plan_version_id,kind,starts_at,ends_at,confirmed_at,anchor_day)
 values(sid,new.id,v.id,'ACTIVATION',t,finish,t,anchor);
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
 values(auth.uid(),'OWNER','SERVICE_ACTIVATED','endpoint_service',sid,jsonb_build_object('planVersion',v.id,'startsAt',t,'endsAt',finish));
 return new;
end$$;
create trigger start_endpoint_service after update of ownership_state on public.codes for each row execute function private.start_endpoint_service();
revoke all on function private.start_endpoint_service() from public,anon,authenticated;

-- Dynamic eligibility, not a scheduler or an expires_at projection that gets stale.
create function private.code_service_available(p_code_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.codes c where c.id=p_code_id and c.card_state='VALID' and c.ownership_state='CLAIMED'
 and c.service_state='ENABLED' and not c.admin_suspended and not c.owner_paused
 and (c.service_policy='LEGACY' or exists(select 1 from public.endpoint_services s where s.current_code_id=c.id and
  (s.legacy_entitlement or exists(select 1 from public.service_periods p where p.service_id=s.id and p.starts_at<=clock_timestamp() and p.ends_at>clock_timestamp())))))
$$;
revoke all on function private.code_service_available(uuid) from public,anon,authenticated;

-- Internal engine is shared by manual approval and future verified provider callbacks.
create function private.confirm_service_order(p_order_id uuid,p_source text,p_provider text,p_reference text,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.service_orders%rowtype;s public.endpoint_services%rowtype;v public.service_plan_versions%rowtype;prior public.service_periods%rowtype;
 t timestamptz;start_time timestamptz;finish timestamptz;anchor integer;result uuid;existing public.service_confirmations%rowtype;cid uuid;
begin
 if p_reference is null or length(p_reference) not between 1 and 200 then raise exception 'INVALID_REFERENCE';end if;
 select * into o from public.service_orders where id=p_order_id;
 if not found or o.source is distinct from p_source or o.provider is distinct from p_provider then raise exception 'INVALID_ORDER';end if;
 perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(p_source,p_provider,p_reference)::text,651));
 select current_code_id into cid from public.endpoint_services where id=o.service_id;
 perform 1 from public.codes where id=cid for share;
 select * into s from public.endpoint_services where id=o.service_id for update;
 if s.current_code_id<>cid then raise exception 'SERVICE_MOVED_RETRY';end if;
 select * into existing from public.service_confirmations where source=p_source and provider=p_provider and external_reference=p_reference;
 if found and existing.order_id<>o.id then raise exception 'CONFIRMATION_ALREADY_USED';end if;
 select id into result from public.service_periods where order_id=o.id;
 if found then
  if not exists(select 1 from public.service_confirmations where order_id=o.id and source=p_source and provider=p_provider and external_reference=p_reference) then raise exception 'CONFIRMATION_CONFLICT';end if;
  return result;
 end if;
 if s.legacy_entitlement or not exists(select 1 from public.codes where id=s.current_code_id and card_state='VALID' and ownership_state='CLAIMED') then raise exception 'SERVICE_NOT_RENEWABLE';end if;
 select * into v from public.service_plan_versions where id=o.plan_version_id;
 select * into prior from public.service_periods where service_id=s.id order by ends_at desc limit 1;
 if not found then raise exception 'SERVICE_NOT_STARTED';end if;
 t:=clock_timestamp();start_time:=greatest(prior.ends_at,t);
 anchor:=extract(day from start_time at time zone 'UTC');
 if prior.ends_at>=t and v.duration_unit='MONTHS' and exists(select 1 from public.service_plan_versions where id=prior.plan_version_id and duration_unit='MONTHS') then anchor:=prior.anchor_day;end if;
 finish:=private.service_end(start_time,v.duration_unit,v.duration_value,anchor);
 insert into public.service_confirmations(order_id,source,provider,external_reference,confirmed_at) values(o.id,p_source,p_provider,p_reference,t);
 insert into public.service_periods(service_id,code_id,plan_version_id,order_id,kind,starts_at,ends_at,confirmed_at,anchor_day)
 values(s.id,s.current_code_id,v.id,o.id,o.purpose,start_time,finish,t,anchor) returning id into result;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
 values(p_actor,case when p_actor is null then 'SYSTEM' else 'ADMIN' end,'SERVICE_'||o.purpose,'endpoint_service',s.id,
 jsonb_build_object('orderId',o.id,'planVersion',v.id,'source',o.source,'startsAt',start_time,'endsAt',finish,'reason',o.reason));
 return result;
end$$;
revoke all on function private.confirm_service_order(uuid,text,text,text,uuid) from public,anon,authenticated,service_role;

create function private.create_service_order(p_code uuid,p_version uuid,p_price uuid,p_source text,p_provider text,p_purpose text,p_key text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.service_admin();sid uuid;o public.service_orders%rowtype;result uuid;
begin
 if p_source is null or p_source not in ('MANUAL_ADMIN','PAYMENT_PROVIDER') or p_purpose is null or p_purpose not in ('RENEWAL','MANUAL_EXTENSION','PLAN_CHANGE')
  or p_provider is null or length(p_provider) not between 1 and 80 or p_key is null or length(p_key) not between 16 and 160 or p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'INVALID_INPUT';end if;
 if p_source='PAYMENT_PROVIDER' and (p_purpose<>'RENEWAL' or p_price is null) then raise exception 'INVALID_PAYMENT_ORDER';end if;
 select id into sid from public.endpoint_services where current_code_id=p_code and not legacy_entitlement;
 if not found then raise exception 'SERVICE_NOT_RENEWABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key,652));
 select * into o from public.service_orders where request_key=p_key;
 if found then
  if (o.service_id,o.plan_version_id,o.price_id,o.source,o.provider,o.purpose,o.reason,o.approved_by) is distinct from (sid,p_version,p_price,p_source,p_provider,p_purpose,trim(p_reason),u) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return o.id;
 end if;
 if not exists(select 1 from public.service_plan_versions v join public.service_plans p on p.id=v.plan_id where v.id=p_version and p.active) then raise exception 'INVALID_PLAN';end if;
 if p_price is not null and not exists(select 1 from public.service_prices where id=p_price and plan_version_id=p_version) then raise exception 'PRICE_PLAN_MISMATCH';end if;
 if not exists(select 1 from public.codes where id=p_code and card_state='VALID' and ownership_state='CLAIMED') then raise exception 'SERVICE_NOT_RENEWABLE';end if;
 insert into public.service_orders(service_id,plan_version_id,price_id,source,provider,purpose,request_key,reason,approved_by)
 values(sid,p_version,p_price,p_source,p_provider,p_purpose,p_key,trim(p_reason),u) returning id into result;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(u,'ADMIN','SERVICE_ORDER_APPROVED','service_order',result,jsonb_build_object('planVersion',p_version,'source',p_source,'purpose',p_purpose,'priceId',p_price));
 return result;
end$$;
revoke all on function private.create_service_order(uuid,uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function private.create_service_order(uuid,uuid,uuid,text,text,text,text,text) to authenticated;
create function public.create_service_order(p_code uuid,p_version uuid,p_price uuid,p_source text,p_provider text,p_purpose text,p_key text,p_reason text) returns uuid
language sql security invoker set search_path='' as $$select private.create_service_order(p_code,p_version,p_price,p_source,p_provider,p_purpose,p_key,p_reason)$$;
revoke all on function public.create_service_order(uuid,uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.create_service_order(uuid,uuid,uuid,text,text,text,text,text) to authenticated;

create function private.confirm_manual_service_order(p_order uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=private.service_admin();begin return private.confirm_service_order(p_order,'MANUAL_ADMIN','ADMIN',p_order::text,u);end$$;
revoke all on function private.confirm_manual_service_order(uuid) from public,anon;
grant execute on function private.confirm_manual_service_order(uuid) to authenticated;
create function public.confirm_manual_service_order(p_order uuid) returns uuid language sql security invoker set search_path='' as $$select private.confirm_manual_service_order(p_order)$$;
revoke all on function public.confirm_manual_service_order(uuid) from public,anon;
grant execute on function public.confirm_manual_service_order(uuid) to authenticated;

-- Integration seam only: no webhook installed, no signature-verification claim.
-- The future server adapter must authenticate the provider event before this RPC.
create function private.confirm_provider_service_order(p_order uuid,p_provider text,p_reference text,p_amount bigint,p_currency text) returns uuid
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.service_orders o join public.service_prices p on p.id=o.price_id
  where o.id=p_order and o.source='PAYMENT_PROVIDER' and o.provider=p_provider and p.amount_minor=p_amount and p.currency=p_currency) then raise exception 'PAYMENT_MISMATCH';end if;
 return private.confirm_service_order(p_order,'PAYMENT_PROVIDER',p_provider,p_reference,null);
end$$;
revoke all on function private.confirm_provider_service_order(uuid,text,text,bigint,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.confirm_provider_service_order(uuid,text,text,bigint,text) to service_role;
create function public.confirm_provider_service_order(p_order uuid,p_provider text,p_reference text,p_amount bigint,p_currency text) returns uuid
language sql security invoker set search_path='' as $$select private.confirm_provider_service_order(p_order,p_provider,p_reference,p_amount,p_currency)$$;
revoke all on function public.confirm_provider_service_order(uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.confirm_provider_service_order(uuid,text,text,bigint,text) to service_role;

-- Only plan IDs/versions and approved order IDs cross the ordinary client boundary.
-- Admin catalogue editing creates NEW immutable versions; no existing order changes.
create function private.manage_service_catalog(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.service_admin();pid uuid;vid uuid;result uuid;version_number integer;
begin
 if p_action='version' then
  insert into public.service_plans(code,name) values(p_data->>'code',p_data->>'name') on conflict(code) do nothing;
  select id into pid from public.service_plans where code=p_data->>'code' for update;
  select coalesce(max(version),0)+1 into version_number from public.service_plan_versions where plan_id=pid;
  insert into public.service_plan_versions(plan_id,version,duration_unit,duration_value) values(pid,version_number,p_data->>'unit',(p_data->>'value')::integer) returning id into result;
 elsif p_action='price' then
  insert into public.service_prices(plan_version_id,amount_minor,currency) values((p_data->>'versionId')::uuid,(p_data->>'amountMinor')::bigint,p_data->>'currency') returning id into result;
 elsif p_action='default' then
  result:=(p_data->>'versionId')::uuid;
  if not exists(select 1 from public.service_plan_versions v join public.service_plans p on p.id=v.plan_id where v.id=result and p.active) then raise exception 'INVALID_PLAN';end if;
  update private.service_defaults set initial_plan_version_id=result;
 elsif p_action='attach' then
  result:=(p_data->>'codeId')::uuid;vid:=(p_data->>'versionId')::uuid;
  if not exists(select 1 from public.service_plan_versions v join public.service_plans p on p.id=v.plan_id where v.id=vid and p.active) then raise exception 'INVALID_PLAN';end if;
  update public.codes set initial_plan_version_id=vid where id=result and service_policy='MANAGED' and ownership_state='UNCLAIMED' and card_state='VALID';
  if not found then raise exception 'CARD_NOT_ATTACHABLE';end if;
 elsif p_action='active' then
  result:=(p_data->>'planId')::uuid;update public.service_plans set active=(p_data->>'active')::boolean where id=result;
  if not found then raise exception 'INVALID_PLAN';end if;
 else raise exception 'INVALID_ACTION';end if;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(u,'ADMIN','SERVICE_CATALOG_'||upper(p_action),'service_catalog',result,p_data);
 return jsonb_build_object('id',result);
end$$;
revoke all on function private.manage_service_catalog(text,jsonb) from public,anon;
grant execute on function private.manage_service_catalog(text,jsonb) to authenticated;
create function public.manage_service_catalog(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.manage_service_catalog(p_action,p_data)$$;
revoke all on function public.manage_service_catalog(text,jsonb) from public,anon;
grant execute on function public.manage_service_catalog(text,jsonb) to authenticated;

create function private.replace_service_card(p_old uuid,p_new uuid,p_key text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.service_admin();old_card public.codes%rowtype;new_card public.codes%rowtype;s public.endpoint_services%rowtype;
 existing public.service_transfers%rowtype;owner uuid;vehicle uuid;result uuid;
begin
 if p_old is null or p_new is null or p_old=p_new or p_key is null or length(p_key) not between 16 and 160 or p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key,653));
 select * into existing from public.service_transfers where request_key=p_key;
 if found then
  if (existing.from_code_id,existing.to_code_id,existing.actor_id,existing.reason) is distinct from (p_old,p_new,u,trim(p_reason)) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return existing.id;
 end if;
 select v.owner_id,v.id into owner,vehicle from public.code_assignments a join public.vehicles v on v.id=a.vehicle_id where a.code_id=p_old and a.ended_at is null and v.archived_at is null;
 if owner is null then raise exception 'ASSIGNMENT_REQUIRED';end if;
 perform 1 from public.profiles where id=owner for update;
 perform 1 from public.vehicles where id=vehicle for update;
 perform 1 from public.codes where id in(p_old,p_new) order by id for update;
 select * into old_card from public.codes where id=p_old;
 select * into new_card from public.codes where id=p_new;
 if old_card.card_state is distinct from 'VALID' or new_card.card_state is distinct from 'VALID' or new_card.ownership_state is distinct from 'UNCLAIMED' then raise exception 'CARD_NOT_REPLACEABLE';end if;
 if not exists(select 1 from public.code_assignments where code_id=p_old and vehicle_id=vehicle and ended_at is null) then raise exception 'ASSIGNMENT_CHANGED';end if;
 perform 1 from public.code_claims where code_id=p_new and claimed_at is null for update;
 if not found then raise exception 'PRIVATE_CREDENTIAL_REQUIRED';end if;
 select * into s from public.endpoint_services where current_code_id=p_old for update;
 if not found then
  if old_card.service_policy<>'LEGACY' then raise exception 'SERVICE_NOT_STARTED';end if;
  insert into public.endpoint_services(current_code_id,legacy_entitlement) values(p_old,true) returning * into s;
 end if;
 -- A legacy target's grandfathered policy cannot turn finite service unlimited.
 -- Use new MANAGED replacement stock for a finite entitlement.
 if new_card.service_policy='LEGACY' and not s.legacy_entitlement then raise exception 'MANAGED_REPLACEMENT_REQUIRED';end if;
 update public.endpoint_services set current_code_id=p_new where id=s.id;
 update public.codes set card_state='REPLACED' where id=p_old;
 update public.code_assignments set ended_at=clock_timestamp(),end_reason='ADMIN_SERVICE_REPLACEMENT' where code_id=p_old and ended_at is null;
 update public.code_claims set claimed_by=owner,claimed_at=clock_timestamp() where code_id=p_new;
 update public.codes set ownership_state='CLAIMED',service_state='ENABLED',owner_paused=old_card.owner_paused,
  admin_suspended=admin_suspended or old_card.admin_suspended where id=p_new;
 insert into public.code_assignments(code_id,vehicle_id,assigned_by) values(p_new,vehicle,owner);
 insert into public.service_transfers(service_id,from_code_id,to_code_id,actor_id,reason,request_key) values(s.id,p_old,p_new,u,trim(p_reason),p_key) returning id into result;
 insert into public.code_replacements(old_code_id,new_code_id,replaced_by,reason) values(p_old,p_new,u,trim(p_reason));
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
 values(u,'ADMIN','SERVICE_CARD_REPLACED','endpoint_service',s.id,jsonb_build_object('oldCode',p_old,'newCode',p_new,'reason',trim(p_reason),'legacyEntitlement',s.legacy_entitlement));
 return result;
end$$;
revoke all on function private.replace_service_card(uuid,uuid,text,text) from public,anon;
grant execute on function private.replace_service_card(uuid,uuid,text,text) to authenticated;
create function public.replace_service_card(p_old uuid,p_new uuid,p_key text,p_reason text) returns uuid language sql security invoker set search_path='' as $$select private.replace_service_card(p_old,p_new,p_key,p_reason)$$;
revoke all on function public.replace_service_card(uuid,uuid,text,text) from public,anon;
grant execute on function public.replace_service_card(uuid,uuid,text,text) to authenticated;

create function private.read_endpoint_service(p_code uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.commercial_user();s public.endpoint_services%rowtype;c public.codes%rowtype;
begin
 if not exists(select 1 from public.internal_memberships where user_id=u and active and role_code='SUPER_ADMIN') and
 not exists(select 1 from public.code_assignments a join public.vehicles v on v.id=a.vehicle_id where a.code_id=p_code and a.ended_at is null and v.owner_id=u) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into c from public.codes where id=p_code;
 if not found then raise exception 'NOT_FOUND';end if;
 select * into s from public.endpoint_services where current_code_id=p_code;
 return jsonb_build_object('codeId',p_code,'serviceId',s.id,'legacy',c.service_policy='LEGACY' or coalesce(s.legacy_entitlement,false),
 'available',private.code_service_available(p_code),'initialPlanVersionId',c.initial_plan_version_id,
 'expiresAt',(select max(ends_at) from public.service_periods where service_id=s.id),
 'periods',(select coalesce(jsonb_agg(p order by p.starts_at),'[]'::jsonb) from (select id,plan_version_id,kind,starts_at,ends_at,confirmed_at from public.service_periods where service_id=s.id order by starts_at desc limit 200) p));
end$$;
revoke all on function private.read_endpoint_service(uuid) from public,anon;
grant execute on function private.read_endpoint_service(uuid) to authenticated;
create function public.read_endpoint_service(p_code uuid) returns jsonb language sql security invoker set search_path='' as $$select private.read_endpoint_service(p_code)$$;
revoke all on function public.read_endpoint_service(uuid) from public,anon;
grant execute on function public.read_endpoint_service(uuid) to authenticated;

create function private.read_service_catalog() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.commercial_user();
 return jsonb_build_object('plans',(select coalesce(jsonb_agg(p),'[]'::jsonb) from public.service_plans p),
 'versions',(select coalesce(jsonb_agg(v),'[]'::jsonb) from public.service_plan_versions v),
 'prices',(select coalesce(jsonb_agg(p),'[]'::jsonb) from public.service_prices p));
end$$;
revoke all on function private.read_service_catalog() from public,anon;
grant execute on function private.read_service_catalog() to authenticated;
create function public.read_service_catalog() returns jsonb language sql security invoker set search_path='' as $$select private.read_service_catalog()$$;
revoke all on function public.read_service_catalog() from public,anon;
grant execute on function public.read_service_catalog() to authenticated;

-- Update all four legacy read/write consumers without replacing the reporting,
-- aggregation, institutional permissions or retry implementations already deployed.
-- Fail migration on schema drift rather than silently omit a gate.
do $$ declare signature text;definition text;needle text:='c.activation_state=''ACTIVE''';begin
 foreach signature in array array['public.get_public_code(text)','public.submit_public_report(text,text,text,text,text,numeric,numeric)',
 'public.get_institutional_scan_context(text,uuid)','public.create_institutional_move_request(uuid,text,text,text,text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if strpos(definition,needle)=0 then raise exception 'SERVICE_GATE_CONSUMER_DRIFT: %',signature;end if;
  definition:=replace(definition,needle,'private.code_service_available(c.id)');
  -- A read gate depends on the live clock, not a stable planner snapshot.
  definition:=replace(definition,'STABLE','VOLATILE');
  execute definition;
 end loop;
end$$;

create function private.guard_report_service() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.codes where id=new.code_id for share;
 if not private.code_service_available(new.code_id) then raise exception 'CODE_NOT_ACTIVE' using errcode='P0002';end if;
 return new;
end$$;
revoke all on function private.guard_report_service() from public,anon,authenticated;
create trigger report_service_gate before insert on public.reports for each row execute function private.guard_report_service();
create trigger institutional_service_gate before insert on public.institutional_actions for each row execute function private.guard_report_service();

create index service_versions_plan on public.service_plan_versions(plan_id);
create index service_prices_version on public.service_prices(plan_version_id);
create index codes_initial_plan on public.codes(initial_plan_version_id);
create index service_orders_service on public.service_orders(service_id);
create index service_orders_version on public.service_orders(plan_version_id);
create index service_orders_price on public.service_orders(price_id);
create index service_orders_approver on public.service_orders(approved_by);
create index service_periods_code on public.service_periods(code_id);
create index service_periods_version on public.service_periods(plan_version_id);
create index service_transfers_service on public.service_transfers(service_id);
create index service_transfers_actor on public.service_transfers(actor_id);
comment on column public.codes.activation_state is 'Compatibility projection only. Expiry is evaluated dynamically by private.code_service_available, never inferred from ACTIVE.';
commit;
