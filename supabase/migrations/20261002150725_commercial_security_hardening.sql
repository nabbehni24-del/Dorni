begin;

-- Invalid proofs return NULL: raising after an UPDATE rolls the counter back.
create or replace function public.claim_dorni_code(p_serial_number text, p_credential_hash text, p_vehicle_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
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
end $$;
revoke all on function public.claim_dorni_code(text,text,uuid) from public,anon;
grant execute on function public.claim_dorni_code(text,text,uuid) to authenticated;

-- A contact number is not proof of ownership. Auth's confirmation timestamp is
-- the sole supported verification authority until an OTP provider is integrated.
create or replace function private.enforce_contact_verification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.kind in ('PRIMARY_PHONE','WHATSAPP','SMS') then
    select u.phone_confirmed_at into new.verified_at from auth.users u
    where u.id=new.user_id and u.phone_confirmed_at is not null
      and regexp_replace(coalesce(u.phone,''),'[^0-9]','','g')=regexp_replace(new.destination,'[^0-9]','','g')
      and regexp_replace(new.destination,'[^0-9]','','g')<>'';
  else
    new.verified_at:=null;
  end if;
  return new;
end $$;
revoke all on function private.enforce_contact_verification() from public,anon,authenticated;
drop trigger if exists contacts_verified_authority on public.contact_methods;
create trigger contacts_verified_authority before insert or update on public.contact_methods
for each row execute function private.enforce_contact_verification();
update public.contact_methods set verified_at=verified_at;

-- Confirmation/revocation must refresh stored proof, even when the phone itself
-- did not change (the legacy provisioning trigger omits phone_confirmed_at).
create or replace function private.sync_phone_verification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.contact_methods set verified_at=verified_at
  where user_id=new.id and kind in ('PRIMARY_PHONE','WHATSAPP','SMS');
  return new;
end $$;
revoke all on function private.sync_phone_verification() from public,anon,authenticated;
drop trigger if exists dorni_phone_verification_updated on auth.users;
create trigger dorni_phone_verification_updated after update of phone,phone_confirmed_at on auth.users
for each row execute function private.sync_phone_verification();

alter table public.code_batches add column if not exists request_fingerprint text;
create or replace function public.create_code_batch(p_organization_id uuid,p_product_type text,p_idempotency_key text,p_codes jsonb)
returns table(batch_id uuid,batch_code text,created_count integer) language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
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
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if exists(select 1 from public.internal_memberships where user_id=v_user and active and role_code in ('SUPER_ADMIN','OPERATIONS','CODE_PRODUCTION')) then
    v_actor:='ADMIN';
  elsif p_organization_id is not null and private.can_generate_for_partner(p_organization_id) then
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

  if v_actor='PARTNER' then
    select generation_limit_per_day into v_daily_limit from public.partner_organizations where id=p_organization_id;
    select coalesce(sum(generated_count),0)::integer into v_used_today
    from public.code_batches
    where organization_id=p_organization_id and created_at>=date_trunc('day',now()) and generation_status='COMPLETED';
    if v_used_today+v_count>v_daily_limit then raise exception 'PARTNER_DAILY_LIMIT' using errcode='22023'; end if;
  end if;

  v_batch_code := 'DOR-'||to_char(now(),'YY')||'-'||lpad(nextval('public.dorni_batch_number')::text,6,'0');
  insert into public.code_batches(batch_code,organization_id,product_type,quantity,generation_status,requested_by,approved_by,idempotency_key)
  values(v_batch_code,p_organization_id,p_product_type,v_count,'GENERATING',v_user,v_user,p_idempotency_key) returning id into v_batch;
  for v_item in select * from jsonb_array_elements(p_codes) loop
    insert into public.codes(batch_id,serial_number,public_token,product_type)
    values(v_batch,v_item->>'serialNumber',v_item->>'publicToken',p_product_type) returning id into v_code_id;
    insert into public.code_claims(code_id,credential_hash) values(v_code_id,v_item->>'credentialHash');
  end loop;
  update public.code_batches set generation_status='COMPLETED',generated_count=v_count,completed_at=now(),request_fingerprint=v_fingerprint where id=v_batch;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,v_actor,'BATCH_GENERATED','code_batch',v_batch,jsonb_build_object('quantity',v_count,'organizationId',p_organization_id));
  return query select v_batch,v_batch_code,v_count;
end $$;

commit;
