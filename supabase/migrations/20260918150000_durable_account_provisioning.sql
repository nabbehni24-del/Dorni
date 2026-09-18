begin;

-- Account provisioning belongs in the database transaction, not in a browser
-- redirect. This keeps profiles and partner memberships durable even when the
-- confirmation tab is closed, refreshed, or opened on another device.
create or replace function private.provision_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users%rowtype;
  v_account_type text;
  v_company_name text;
  v_company_type text;
  v_registration_number text;
  v_org public.partner_organizations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select * into v_user from auth.users where id = p_user_id;
  if v_user.id is null then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.profiles(id, phone, email, full_name)
  values (
    v_user.id,
    v_user.phone,
    lower(v_user.email),
    nullif(trim(v_user.raw_user_meta_data->>'full_name'), '')
  )
  on conflict (id) do update set
    phone = coalesce(excluded.phone, public.profiles.phone),
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    updated_at = now();

  insert into public.notification_preferences(user_id, sms_enabled)
  values (v_user.id, v_user.phone is not null)
  on conflict (user_id) do nothing;

  if v_user.phone is not null then
    insert into public.contact_methods(user_id, kind, destination, verified_at)
    values (v_user.id, 'PRIMARY_PHONE', v_user.phone, now())
    on conflict (user_id, kind, destination) do update set
      verified_at = coalesce(public.contact_methods.verified_at, excluded.verified_at),
      enabled = true;
  end if;

  v_account_type := coalesce(v_user.raw_user_meta_data->>'account_type', 'owner');
  if v_account_type <> 'partner' or v_user.email_confirmed_at is null then
    return jsonb_build_object('profileReady', true, 'partnerReady', false);
  end if;

  select o.* into v_org
  from public.partner_memberships m
  join public.partner_organizations o on o.id = m.organization_id
  where m.user_id = v_user.id and m.status = 'ACTIVE'
  order by m.created_at
  limit 1;

  if v_org.id is not null then
    return jsonb_build_object(
      'profileReady', true,
      'partnerReady', true,
      'organizationId', v_org.id,
      'created', false
    );
  end if;

  v_company_name := nullif(trim(v_user.raw_user_meta_data->>'company_name'), '');
  v_company_type := coalesce(nullif(trim(v_user.raw_user_meta_data->>'company_type'), ''), 'CORPORATE');
  v_registration_number := nullif(trim(v_user.raw_user_meta_data->>'registration_number'), '');

  -- Partner invite accounts intentionally have no company name; their
  -- membership is created by claim_partner_invitation instead.
  if v_company_name is null then
    return jsonb_build_object('profileReady', true, 'partnerReady', false, 'awaitingInvitation', true);
  end if;
  if char_length(v_company_name) > 160 then
    raise exception 'INVALID_PARTNER_NAME' using errcode = '22023';
  end if;
  if v_company_type not in ('INSURANCE', 'CORPORATE', 'DISTRIBUTOR', 'OTHER') then
    raise exception 'INVALID_PARTNER_TYPE' using errcode = '22023';
  end if;

  insert into public.partner_organizations(
    name, type, status, trusted_generation, registration_number, generation_limit_per_day
  ) values (
    v_company_name, v_company_type, 'ACTIVE', true, v_registration_number, 100
  ) returning * into v_org;

  insert into public.partner_memberships(organization_id, user_id, role, status)
  values (v_org.id, v_user.id, 'PARTNER_ADMIN', 'ACTIVE')
  on conflict (organization_id, user_id) do update set
    role = 'PARTNER_ADMIN',
    status = 'ACTIVE';

  insert into public.audit_logs(actor_id, actor_kind, action, entity_type, entity_id, safe_metadata)
  values (
    v_user.id,
    'PARTNER',
    'PARTNER_ACCOUNT_PROVISIONED',
    'partner_organization',
    v_org.id,
    jsonb_build_object('type', v_company_type, 'source', 'durable_account_provisioning')
  );

  return jsonb_build_object(
    'profileReady', true,
    'partnerReady', true,
    'organizationId', v_org.id,
    'created', true
  );
end
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.provision_account(new.id);
  return new;
end
$$;

create or replace function private.handle_updated_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.provision_account(new.id);
  return new;
exception
  when others then
    -- Authentication must never be blocked by a provisioning error. The login
    -- path retries provisioning and returns a useful application error.
    raise warning 'Dorni account provisioning failed for %: %', new.id, sqlerrm;
    return new;
end
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, phone, email_confirmed_at, raw_user_meta_data on auth.users
for each row execute function private.handle_updated_user();

create or replace function public.provision_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  return private.provision_account(v_user);
end
$$;

revoke all on function private.provision_account(uuid) from public, anon, authenticated;
revoke all on function public.provision_my_account() from public, anon, authenticated;
grant execute on function public.provision_my_account() to authenticated;

-- Repair confirmed company accounts that were created by the old callback-only
-- flow but never received their durable organization membership.
do $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select u.id
    from auth.users u
    where u.email_confirmed_at is not null
      and coalesce(u.raw_user_meta_data->>'account_type', '') = 'partner'
      and nullif(trim(u.raw_user_meta_data->>'company_name'), '') is not null
      and not exists (
        select 1 from public.partner_memberships m
        where m.user_id = u.id and m.status = 'ACTIVE'
      )
  loop
    begin
      perform private.provision_account(v_user_id);
    exception
      when others then
        raise warning 'Dorni backfill failed for %: %', v_user_id, sqlerrm;
    end;
  end loop;
end
$$;

commit;
