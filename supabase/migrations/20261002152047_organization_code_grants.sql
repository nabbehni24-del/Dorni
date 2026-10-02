begin;
create table public.organization_code_grants(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.partner_organizations(id),
 product_type text not null check(length(product_type) between 2 and 60),
 quantity integer not null check(quantity between 1 and 1000000),
 consumed integer not null default 0 check(consumed>=0 and consumed<=quantity),
 reference text not null check(length(reference) between 3 and 160),
 granted_by uuid not null references public.profiles(id),
 granted_at timestamptz not null default clock_timestamp(),
 request_key text not null unique check(length(request_key) between 16 and 160),
 revoked_at timestamptz,
 revoked_by uuid references public.profiles(id),
 revoke_reason text,
 check((revoked_at is null)=(revoked_by is null))
);
create index organization_code_grants_balance on public.organization_code_grants(organization_id,product_type,granted_at,id) where revoked_at is null;
create index organization_code_grants_granter on public.organization_code_grants(granted_by);
create index organization_code_grants_revoker on public.organization_code_grants(revoked_by);
create table public.organization_code_consumptions(
 batch_id uuid not null references public.code_batches(id),
 grant_id uuid not null references public.organization_code_grants(id),
 quantity integer not null check(quantity>0),
 created_at timestamptz not null default clock_timestamp(),
 primary key(batch_id,grant_id)
);
create index organization_code_consumptions_grant on public.organization_code_consumptions(grant_id);
alter table public.organization_code_grants enable row level security;
alter table public.organization_code_consumptions enable row level security;
revoke all on public.organization_code_grants,public.organization_code_consumptions from public,anon,authenticated;
-- Intentional default-deny RLS: all access goes through scoped, session-checked RPCs.
-- No backfill from trusted_generation, historical batches or inventory allocations.

create function private.can_issue_codes(org_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.partner_memberships m join public.partner_organizations o on o.id=m.organization_id
 where m.organization_id=org_id and m.user_id=auth.uid() and m.status='ACTIVE'
 and m.role in ('PARTNER_ADMIN','PARTNER_OPERATOR') and o.status='ACTIVE')
$$;
revoke all on function private.can_issue_codes(uuid) from public,anon,authenticated;

create function private.organization_code_inventory(p_organization_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.commercial_user(); admin boolean;
begin
 select exists(select 1 from public.internal_memberships where user_id=u and active and role_code='SUPER_ADMIN') into admin;
 if not admin and not exists(select 1 from public.partner_memberships m join public.partner_organizations o on o.id=m.organization_id
  where m.organization_id=p_organization_id and m.user_id=u and m.status='ACTIVE' and o.status='ACTIVE') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if not exists(select 1 from public.partner_organizations where id=p_organization_id) then raise exception 'NOT_FOUND'; end if;
 return jsonb_build_object('organizationId',p_organization_id,'canIssue',private.can_issue_codes(p_organization_id),
  'balances',(select coalesce(jsonb_agg(s),'[]'::jsonb) from (
   select product_type,sum(quantity)::bigint granted,sum(consumed)::bigint issued,
    coalesce(sum(quantity-consumed) filter(where revoked_at is not null),0)::bigint revoked,
    coalesce(sum(quantity-consumed) filter(where revoked_at is null),0)::bigint remaining
   from public.organization_code_grants where organization_id=p_organization_id group by product_type) s),
  'grants',(select coalesce(jsonb_agg(g order by granted_at desc),'[]'::jsonb) from (
   select id,product_type,quantity,consumed,reference,granted_at,revoked_at from public.organization_code_grants
   where organization_id=p_organization_id order by granted_at desc,id desc limit 200) g),
  'legacyIssued',(select coalesce(sum(b.generated_count),0) from public.code_batches b
   where b.organization_id=p_organization_id and not exists(select 1 from public.organization_code_consumptions x where x.batch_id=b.id)));
end $$;
revoke all on function private.organization_code_inventory(uuid) from public,anon;
grant execute on function private.organization_code_inventory(uuid) to authenticated;
create function public.organization_code_inventory(p_organization_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.organization_code_inventory(p_organization_id) $$;
revoke all on function public.organization_code_inventory(uuid) from public,anon;
grant execute on function public.organization_code_inventory(uuid) to authenticated;

create function private.grant_organization_codes(p_organization_id uuid,p_product_type text,p_quantity integer,p_reference text,p_request_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.commercial_user(); existing public.organization_code_grants%rowtype; result uuid;
begin
 if not exists(select 1 from public.internal_memberships where user_id=u and active and role_code='SUPER_ADMIN') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_quantity is null or p_quantity not between 1 and 1000000 or p_product_type is null or length(p_product_type) not between 2 and 60
  or p_reference is null or length(trim(p_reference)) not between 3 and 160 or p_request_key is null or length(p_request_key) not between 16 and 160 then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_key,432));
 select * into existing from public.organization_code_grants where request_key=p_request_key;
 if found then
  if existing.organization_id is distinct from p_organization_id or existing.product_type<>p_product_type or existing.quantity<>p_quantity or existing.reference<>trim(p_reference) or existing.granted_by<>u then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='22023'; end if;
  return existing.id;
 end if;
 perform 1 from public.partner_organizations where id=p_organization_id and status='ACTIVE' for update;
 if not found then raise exception 'PARTNER_NOT_ACTIVE'; end if;
 insert into public.organization_code_grants(organization_id,product_type,quantity,reference,granted_by,request_key)
 values(p_organization_id,p_product_type,p_quantity,trim(p_reference),u,p_request_key) returning id into result;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
 values(u,'ADMIN','CODE_GRANT_CREATED','organization_code_grant',result,jsonb_build_object('organizationId',p_organization_id,'quantity',p_quantity,'productType',p_product_type));
 return result;
end $$;
revoke all on function private.grant_organization_codes(uuid,text,integer,text,text) from public,anon;
grant execute on function private.grant_organization_codes(uuid,text,integer,text,text) to authenticated;
create function public.grant_organization_codes(p_organization_id uuid,p_product_type text,p_quantity integer,p_reference text,p_request_key text) returns uuid language sql security invoker set search_path='' as $$ select private.grant_organization_codes(p_organization_id,p_product_type,p_quantity,p_reference,p_request_key) $$;
revoke all on function public.grant_organization_codes(uuid,text,integer,text,text) from public,anon;
grant execute on function public.grant_organization_codes(uuid,text,integer,text,text) to authenticated;

create function private.revoke_organization_code_grant(p_grant_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.commercial_user(); org uuid; g public.organization_code_grants%rowtype;
begin
 if not exists(select 1 from public.internal_memberships where user_id=u and active and role_code='SUPER_ADMIN') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'INVALID_INPUT'; end if;
 select organization_id into org from public.organization_code_grants where id=p_grant_id;
 if not found then raise exception 'NOT_FOUND'; end if;
 -- Same lock order as issuance: organization, then grants in FIFO order.
 perform 1 from public.partner_organizations where id=org for update;
 select * into g from public.organization_code_grants where id=p_grant_id for update;
 if g.revoked_at is null then
  update public.organization_code_grants set revoked_at=now(),revoked_by=u,revoke_reason=trim(p_reason) where id=g.id;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(u,'ADMIN','CODE_GRANT_REVOKED','organization_code_grant',g.id,jsonb_build_object('unused',g.quantity-g.consumed,'reason',trim(p_reason)));
 end if;
 return jsonb_build_object('id',g.id,'revokedUnused',g.quantity-g.consumed,'issuedUnchanged',g.consumed);
end $$;
revoke all on function private.revoke_organization_code_grant(uuid,text) from public,anon;
grant execute on function private.revoke_organization_code_grant(uuid,text) to authenticated;
create function public.revoke_organization_code_grant(p_grant_id uuid,p_reason text) returns jsonb language sql security invoker set search_path='' as $$ select private.revoke_organization_code_grant(p_grant_id,p_reason) $$;
revoke all on function public.revoke_organization_code_grant(uuid,text) from public,anon;
grant execute on function public.revoke_organization_code_grant(uuid,text) to authenticated;

-- Issuance replacement appended below. Credit consumption and code insertion
-- share one transaction: neither partial batches nor partial debits can commit.
create or replace function public.create_code_batch(p_organization_id uuid,p_product_type text,p_idempotency_key text,p_codes jsonb)
returns table(batch_id uuid,batch_code text,created_count integer) language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.commercial_user();
  v_batch uuid;
  v_code_id uuid;
  v_batch_code text;
  v_item jsonb;
  v_count integer := jsonb_array_length(p_codes);
  v_actor text;
  v_daily_limit integer;
  v_used_today integer;
  v_existing public.code_batches%rowtype;
  v_fingerprint text;
  v_remaining integer;
  v_take integer;
  g public.organization_code_grants%rowtype;
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if exists(select 1 from public.internal_memberships where user_id=v_user and active and role_code in ('SUPER_ADMIN','OPERATIONS','CODE_PRODUCTION')) then
    v_actor:='ADMIN';
  elsif p_organization_id is not null and private.can_issue_codes(p_organization_id) then
    v_actor:='PARTNER';
  else
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 16 and 160 then raise exception 'INVALID_REQUEST_KEY'; end if;
  if p_codes is null or jsonb_typeof(p_codes)<>'array' then raise exception 'INVALID_CODES'; end if;
  perform 1 from public.profiles where id=v_user and account_status='ACTIVE' for share;
  if not found then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,431));
  v_fingerprint:=encode(extensions.digest(jsonb_build_array(v_user,p_organization_id,p_product_type,p_codes)::text,'sha256'),'hex');
  select * into v_existing from public.code_batches where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.requested_by is distinct from v_user or v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return query select v_existing.id,v_existing.batch_code,v_existing.generated_count; return;
  end if;
  -- One organization lock covers all issuers, not just one browser/user.
  if p_organization_id is not null then
    perform 1 from public.partner_organizations where id=p_organization_id for update;
  end if;
  if v_count<1 or v_count>1000 then raise exception 'INVALID_BATCH_SIZE' using errcode='22023'; end if;
  if p_organization_id is not null and not exists(select 1 from public.partner_organizations where id=p_organization_id and status='ACTIVE') then raise exception 'PARTNER_NOT_ACTIVE' using errcode='22023'; end if;

  if p_organization_id is not null then
    select generation_limit_per_day into v_daily_limit from public.partner_organizations where id=p_organization_id;
    select coalesce(sum(generated_count),0)::integer into v_used_today
    from public.code_batches
    where organization_id=p_organization_id and created_at>=date_trunc('day',now()) and generation_status='COMPLETED';
    if v_used_today+v_count>v_daily_limit then raise exception 'PARTNER_DAILY_LIMIT' using errcode='22023'; end if;
  end if;

  if p_organization_id is not null and coalesce((select sum(quantity-consumed) from public.organization_code_grants where organization_id=p_organization_id and product_type=p_product_type and revoked_at is null),0)<v_count then
    raise exception 'INSUFFICIENT_CODE_BALANCE' using errcode='22023';
  end if;
  v_batch_code := 'DOR-'||to_char(now(),'YY')||'-'||lpad(nextval('public.dorni_batch_number')::text,6,'0');
  insert into public.code_batches(batch_code,organization_id,product_type,quantity,generation_status,requested_by,approved_by,idempotency_key)
  values(v_batch_code,p_organization_id,p_product_type,v_count,'GENERATING',v_user,v_user,p_idempotency_key) returning id into v_batch;
  for v_item in select * from jsonb_array_elements(p_codes) loop
    insert into public.codes(batch_id,serial_number,public_token,product_type)
    values(v_batch,v_item->>'serialNumber',v_item->>'publicToken',p_product_type) returning id into v_code_id;
    insert into public.code_claims(code_id,credential_hash) values(v_code_id,v_item->>'credentialHash');
  end loop;
  if p_organization_id is not null then
    v_remaining:=v_count;
    for g in select * from public.organization_code_grants where organization_id=p_organization_id
      and product_type=p_product_type and revoked_at is null and consumed<quantity order by granted_at,id for update loop
      v_take:=least(v_remaining,g.quantity-g.consumed);
      update public.organization_code_grants set consumed=consumed+v_take where id=g.id;
      insert into public.organization_code_consumptions(batch_id,grant_id,quantity) values(v_batch,g.id,v_take);
      v_remaining:=v_remaining-v_take;
      exit when v_remaining=0;
    end loop;
    if v_remaining<>0 then raise exception 'INSUFFICIENT_CODE_BALANCE'; end if;
  end if;
  update public.code_batches set generation_status='COMPLETED',generated_count=v_count,completed_at=now(),request_fingerprint=v_fingerprint where id=v_batch;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,v_actor,'BATCH_GENERATED','code_batch',v_batch,jsonb_build_object('quantity',v_count,'organizationId',p_organization_id));
  return query select v_batch,v_batch_code,v_count;
end $$;

commit;
