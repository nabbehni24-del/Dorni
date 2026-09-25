begin;

-- Companies may register themselves, but only Dorni's single super admin can
-- activate them and decide whether they may generate codes directly.
alter table public.partner_organizations
  drop constraint if exists partner_organizations_status_check;

alter table public.partner_organizations
  add constraint partner_organizations_status_check
  check (status in ('PENDING','ACTIVE','SUSPENDED','REJECTED'));

alter table public.partner_organizations
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists review_note text check (review_note is null or char_length(review_note) <= 1000);

alter table public.partner_batch_requests
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists review_note text check (review_note is null or char_length(review_note) <= 1000);

create index if not exists partner_organizations_status_created_idx
  on public.partner_organizations(status, created_at desc);
create index if not exists partner_batch_requests_status_created_idx
  on public.partner_batch_requests(status, created_at desc);
create index if not exists audit_logs_created_idx
  on public.audit_logs(created_at desc);

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
      'organizationStatus', v_org.status,
      'created', false
    );
  end if;

  v_company_name := nullif(trim(v_user.raw_user_meta_data->>'company_name'), '');
  v_company_type := coalesce(nullif(trim(v_user.raw_user_meta_data->>'company_type'), ''), 'CORPORATE');
  v_registration_number := nullif(trim(v_user.raw_user_meta_data->>'registration_number'), '');

  -- Invitation accounts join an organization created by Dorni instead.
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
    v_company_name, v_company_type, 'PENDING', false, v_registration_number, 100
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
    'PARTNER_APPLICATION_SUBMITTED',
    'partner_organization',
    v_org.id,
    jsonb_build_object('type', v_company_type, 'source', 'durable_account_provisioning')
  );

  return jsonb_build_object(
    'profileReady', true,
    'partnerReady', true,
    'organizationId', v_org.id,
    'organizationStatus', v_org.status,
    'created', true
  );
exception
  when unique_violation then
    raise exception 'REGISTRATION_NUMBER_EXISTS' using errcode = '23505';
end
$$;

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
  order by m.created_at
  limit 1;
  if v_org.id is not null then
    return jsonb_build_object('organization',to_jsonb(v_org),'created',false);
  end if;

  insert into public.partner_organizations(name,type,status,trusted_generation,registration_number,generation_limit_per_day)
  values(trim(p_name),p_type,'PENDING',false,nullif(trim(p_registration_number),''),100)
  returning * into v_org;
  insert into public.partner_memberships(organization_id,user_id,role,status)
  values(v_org.id,v_user,'PARTNER_ADMIN','ACTIVE');
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','PARTNER_APPLICATION_SUBMITTED','partner_organization',v_org.id,jsonb_build_object('type',p_type));
  return jsonb_build_object('organization',to_jsonb(v_org),'created',true);
exception when unique_violation then
  raise exception 'REGISTRATION_NUMBER_EXISTS' using errcode='23505';
end $$;

create or replace function public.get_my_account_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_internal text; v_partner record;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select role_code into v_internal from public.internal_memberships where user_id=v_user and active limit 1;
  select m.role,m.organization_id,o.name,o.status into v_partner
  from public.partner_memberships m join public.partner_organizations o on o.id=m.organization_id
  where m.user_id=v_user and m.status='ACTIVE'
  order by m.created_at
  limit 1;
  return jsonb_build_object(
    'internalRole',v_internal,
    'partnerRole',v_partner.role,
    'organizationId',v_partner.organization_id,
    'organizationName',v_partner.name,
    'organizationStatus',v_partner.status,
    'destination',case when v_internal is not null then '/admin' when v_partner.role is not null then '/partner' else '/app' end
  );
end $$;

create or replace function public.get_admin_overview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_role text; v_result jsonb;
begin
  select role_code into v_role from public.internal_memberships where user_id=v_user and active;
  if v_role <> 'SUPER_ADMIN' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select jsonb_build_object(
    'role',v_role,
    'metrics',jsonb_build_object(
      'users',(select count(*) from public.profiles),
      'vehicles',(select count(*) from public.vehicles),
      'codes',(select count(*) from public.codes),
      'reports',(select count(*) from public.reports),
      'activeReports',(select count(*) from public.reports where status='ACTIVE'),
      'partners',(select count(*) from public.partner_organizations),
      'pendingPartners',(select count(*) from public.partner_organizations where status='PENDING'),
      'pendingBatchRequests',(select count(*) from public.partner_batch_requests where status='PENDING'),
      'support',(select count(*) from public.support_tickets where status in ('OPEN','IN_PROGRESS')),
      'batches',(select count(*) from public.code_batches),
      'failedNotifications',(select count(*) from public.notification_messages where status='FAILED')
    ),
    'organizations',coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select o.id,o.name,o.type,o.status,o.trusted_generation,o.registration_number,
          o.generation_limit_per_day,o.reviewed_at,o.review_note,o.created_at,
          a.user_id as admin_user_id,a.full_name as admin_name,a.email as admin_email
        from public.partner_organizations o
        left join lateral (
          select p.id as user_id,p.full_name,p.email
          from public.partner_memberships m
          join public.profiles p on p.id=m.user_id
          where m.organization_id=o.id and m.role='PARTNER_ADMIN'
          order by m.created_at limit 1
        ) a on true
        order by o.created_at desc limit 100
      ) x
    ),'[]'::jsonb),
    'batchRequests',coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select r.id,r.quantity,r.product_type,r.status,r.notes,r.review_note,r.created_at,r.reviewed_at,
          o.id as organization_id,o.name as organization_name
        from public.partner_batch_requests r
        join public.partner_organizations o on o.id=r.organization_id
        order by r.created_at desc limit 100
      ) x
    ),'[]'::jsonb),
    'recentBatches',coalesce((select jsonb_agg(x) from (select id,batch_code,quantity,generated_count,generation_status,production_status,distribution_status,organization_id,created_at from public.code_batches order by created_at desc limit 30)x),'[]'::jsonb),
    'recentReports',coalesce((select jsonb_agg(x) from (select id,report_type_code,status,duplicate_count,created_at from public.reports order by created_at desc limit 30)x),'[]'::jsonb),
    'supportTickets',coalesce((select jsonb_agg(x) from (select id,subject,category,status,created_at from public.support_tickets order by created_at desc limit 30)x),'[]'::jsonb),
    'auditLogs',coalesce((select jsonb_agg(x) from (select id,actor_kind,action,entity_type,entity_id,safe_metadata,created_at from public.audit_logs order by created_at desc limit 50)x),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- Keep organization creation in the same single-admin trust boundary as
-- approvals. Existing organizations and memberships are not changed.
create or replace function public.create_partner_organization(
  p_name text,
  p_type text,
  p_admin_email text,
  p_invite_token_hash text,
  p_trusted_generation boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
  v_org public.partner_organizations%rowtype;
  v_partner_user uuid;
  v_membership public.partner_memberships%rowtype;
  v_invite public.partner_invitations%rowtype;
begin
  select role_code into v_role from public.internal_memberships where user_id=v_user and active;
  if v_role <> 'SUPER_ADMIN' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_type not in ('INSURANCE','CORPORATE','DISTRIBUTOR','OTHER') then raise exception 'INVALID_PARTNER_TYPE' using errcode='22023'; end if;
  if nullif(trim(p_name),'') is null or char_length(trim(p_name))>160 or nullif(trim(p_admin_email),'') is null then
    raise exception 'INVALID_PARTNER' using errcode='22023';
  end if;

  insert into public.partner_organizations(name,type,status,trusted_generation)
  values(trim(p_name),p_type,'ACTIVE',p_trusted_generation) returning * into v_org;
  select id into v_partner_user from auth.users where lower(email)=lower(trim(p_admin_email)) limit 1;
  if v_partner_user is not null then
    insert into public.partner_memberships(organization_id,user_id,role,status)
    values(v_org.id,v_partner_user,'PARTNER_ADMIN','ACTIVE') returning * into v_membership;
  else
    insert into public.partner_invitations(organization_id,email,role,token_hash,created_by)
    values(v_org.id,lower(trim(p_admin_email)),'PARTNER_ADMIN',p_invite_token_hash,v_user) returning * into v_invite;
  end if;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'ADMIN','PARTNER_CREATED','partner_organization',v_org.id,jsonb_build_object('trustedGeneration',p_trusted_generation));
  return jsonb_build_object(
    'organization',to_jsonb(v_org),
    'membership',case when v_membership.id is null then null else to_jsonb(v_membership) end,
    'invitation',case when v_invite.id is null then null else jsonb_build_object('id',v_invite.id,'email',v_invite.email,'expiresAt',v_invite.expires_at) end
  );
end $$;

create or replace function public.admin_set_partner_status(
  p_organization_id uuid,
  p_status text,
  p_trusted_generation boolean default false,
  p_generation_limit integer default 100,
  p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_role text; v_org public.partner_organizations%rowtype;
begin
  select role_code into v_role from public.internal_memberships where user_id=v_user and active;
  if v_role <> 'SUPER_ADMIN' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_status not in ('ACTIVE','SUSPENDED','REJECTED') then raise exception 'INVALID_STATUS' using errcode='22023'; end if;
  if p_generation_limit < 1 or p_generation_limit > 100000 then raise exception 'INVALID_LIMIT' using errcode='22023'; end if;
  if p_note is not null and char_length(p_note)>1000 then raise exception 'INVALID_NOTE' using errcode='22023'; end if;

  update public.partner_organizations set
    status=p_status,
    trusted_generation=case when p_status='ACTIVE' then p_trusted_generation else false end,
    generation_limit_per_day=p_generation_limit,
    reviewed_at=now(),
    reviewed_by=v_user,
    review_note=nullif(trim(coalesce(p_note,'')),''),
    updated_at=now()
  where id=p_organization_id
  returning * into v_org;
  if v_org.id is null then raise exception 'PARTNER_NOT_FOUND' using errcode='P0002'; end if;

  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'ADMIN','PARTNER_STATUS_CHANGED','partner_organization',v_org.id,
    jsonb_build_object('status',p_status,'trustedGeneration',v_org.trusted_generation,'generationLimitPerDay',v_org.generation_limit_per_day));
  return to_jsonb(v_org);
end $$;

create or replace function public.admin_review_batch_request(
  p_request_id uuid,
  p_status text,
  p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_role text; v_request public.partner_batch_requests%rowtype;
begin
  select role_code into v_role from public.internal_memberships where user_id=v_user and active;
  if v_role <> 'SUPER_ADMIN' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_status not in ('APPROVED','REJECTED') then raise exception 'INVALID_STATUS' using errcode='22023'; end if;
  if p_note is not null and char_length(p_note)>1000 then raise exception 'INVALID_NOTE' using errcode='22023'; end if;

  update public.partner_batch_requests set
    status=p_status,
    reviewed_at=now(),
    reviewed_by=v_user,
    review_note=nullif(trim(coalesce(p_note,'')),'')
  where id=p_request_id and status='PENDING'
  returning * into v_request;
  if v_request.id is null then raise exception 'REQUEST_NOT_PENDING' using errcode='22023'; end if;

  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'ADMIN','BATCH_REQUEST_REVIEWED','partner_batch_request',v_request.id,
    jsonb_build_object('status',p_status,'organizationId',v_request.organization_id,'quantity',v_request.quantity));
  return to_jsonb(v_request);
end $$;

drop policy if exists partner_requests_insert on public.partner_batch_requests;
create policy partner_requests_insert on public.partner_batch_requests for insert to authenticated
with check (
  requested_by=(select auth.uid())
  and private.is_partner_member(organization_id)
  and exists(select 1 from public.partner_organizations o where o.id=organization_id and o.status='ACTIVE')
);

revoke all on function public.register_my_partner_organization(text,text,text) from public,anon,authenticated;
grant execute on function public.register_my_partner_organization(text,text,text) to authenticated;
revoke all on function public.get_my_account_context() from public,anon,authenticated;
grant execute on function public.get_my_account_context() to authenticated;
revoke all on function public.get_admin_overview() from public,anon,authenticated;
grant execute on function public.get_admin_overview() to authenticated;
revoke all on function public.create_partner_organization(text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.create_partner_organization(text,text,text,text,boolean) to authenticated;
revoke all on function public.admin_set_partner_status(uuid,text,boolean,integer,text) from public,anon,authenticated;
grant execute on function public.admin_set_partner_status(uuid,text,boolean,integer,text) to authenticated;
revoke all on function public.admin_review_batch_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_review_batch_request(uuid,text,text) to authenticated;

commit;

