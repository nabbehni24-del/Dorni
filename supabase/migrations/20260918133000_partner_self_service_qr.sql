begin;

alter table public.partner_organizations
  add column if not exists registration_number text,
  add column if not exists generation_limit_per_day integer not null default 100
    check (generation_limit_per_day between 1 and 100000);

update public.partner_organizations
set generation_limit_per_day=1000
where trusted_generation and generation_limit_per_day=100;

create unique index if not exists partner_organizations_registration_unique
on public.partner_organizations(lower(registration_number))
where registration_number is not null and registration_number<>'';

create or replace function public.register_my_partner_organization(
  p_name text,
  p_type text,
  p_registration_number text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := (select auth.uid());
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
  limit 1;
  if v_org.id is not null then
    return jsonb_build_object('organization',to_jsonb(v_org),'created',false);
  end if;

  insert into public.partner_organizations(name,type,status,trusted_generation,registration_number,generation_limit_per_day)
  values(trim(p_name),p_type,'ACTIVE',true,nullif(trim(p_registration_number),''),100)
  returning * into v_org;
  insert into public.partner_memberships(organization_id,user_id,role,status)
  values(v_org.id,v_user,'PARTNER_ADMIN','ACTIVE');
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','PARTNER_SELF_REGISTERED','partner_organization',v_org.id,jsonb_build_object('type',p_type));
  return jsonb_build_object('organization',to_jsonb(v_org),'created',true);
exception when unique_violation then
  raise exception 'REGISTRATION_NUMBER_EXISTS' using errcode='23505';
end $$;

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
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if exists(select 1 from public.internal_memberships where user_id=v_user and active and role_code in ('SUPER_ADMIN','OPERATIONS','CODE_PRODUCTION')) then
    v_actor:='ADMIN';
  elsif p_organization_id is not null and private.can_generate_for_partner(p_organization_id) then
    v_actor:='PARTNER';
  else
    raise exception 'FORBIDDEN' using errcode='42501';
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

  select id,code_batches.batch_code into v_batch,v_batch_code from public.code_batches where idempotency_key=p_idempotency_key;
  if v_batch is not null then return query select v_batch,v_batch_code,(select generated_count from public.code_batches where id=v_batch); return; end if;
  v_batch_code := 'DOR-'||to_char(now(),'YY')||'-'||lpad(nextval('public.dorni_batch_number')::text,6,'0');
  insert into public.code_batches(batch_code,organization_id,product_type,quantity,generation_status,requested_by,approved_by,idempotency_key)
  values(v_batch_code,p_organization_id,p_product_type,v_count,'GENERATING',v_user,v_user,p_idempotency_key) returning id into v_batch;
  for v_item in select * from jsonb_array_elements(p_codes) loop
    insert into public.codes(batch_id,serial_number,public_token,product_type)
    values(v_batch,v_item->>'serialNumber',v_item->>'publicToken',p_product_type) returning id into v_code_id;
    insert into public.code_claims(code_id,credential_hash) values(v_code_id,v_item->>'credentialHash');
  end loop;
  update public.code_batches set generation_status='COMPLETED',generated_count=v_count,completed_at=now() where id=v_batch;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,v_actor,'BATCH_GENERATED','code_batch',v_batch,jsonb_build_object('quantity',v_count,'organizationId',p_organization_id));
  return query select v_batch,v_batch_code,v_count;
end $$;

revoke all on function public.register_my_partner_organization(text,text,text) from public,anon,authenticated;
grant execute on function public.register_my_partner_organization(text,text,text) to authenticated;

revoke all on function public.create_code_batch(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_code_batch(uuid,text,text,jsonb) to authenticated;

commit;
