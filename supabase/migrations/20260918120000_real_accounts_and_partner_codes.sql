begin;

alter table public.profiles add column if not exists full_name text;

create table if not exists public.partner_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.partner_organizations(id) on delete cascade,
  email text not null,
  role text not null default 'PARTNER_ADMIN' check (role in ('PARTNER_ADMIN','PARTNER_OPERATOR','PARTNER_VIEWER')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  claimed_by uuid references public.profiles(id),
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.partner_invitations enable row level security;

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, phone, email, full_name)
  values (new.id, new.phone, lower(new.email), nullif(trim(new.raw_user_meta_data->>'full_name'),''));

  insert into public.notification_preferences(user_id, sms_enabled)
  values (new.id, new.phone is not null);

  if new.phone is not null then
    insert into public.contact_methods(user_id, kind, destination, verified_at)
    values (new.id, 'PRIMARY_PHONE', new.phone, now());
  end if;
  return new;
end $$;

create or replace function private.can_generate_for_partner(org_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.partner_memberships m
    join public.partner_organizations o on o.id=m.organization_id
    where m.organization_id=org_id
      and m.user_id=(select auth.uid())
      and m.status='ACTIVE'
      and m.role in ('PARTNER_ADMIN','PARTNER_OPERATOR')
      and o.status='ACTIVE'
      and o.trusted_generation
  )
$$;

create or replace function public.get_my_account_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_internal text; v_partner record;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select role_code into v_internal from public.internal_memberships where user_id=v_user and active limit 1;
  select m.role,m.organization_id,o.name into v_partner
  from public.partner_memberships m join public.partner_organizations o on o.id=m.organization_id
  where m.user_id=v_user and m.status='ACTIVE' and o.status='ACTIVE' limit 1;
  return jsonb_build_object(
    'internalRole',v_internal,
    'partnerRole',v_partner.role,
    'organizationId',v_partner.organization_id,
    'organizationName',v_partner.name,
    'destination',case when v_internal is not null then '/admin' when v_partner.role is not null then '/partner' else '/app' end
  );
end $$;

create or replace function public.preview_partner_invitation(p_token_hash text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('email',i.email,'organizationName',o.name,'role',i.role,'expiresAt',i.expires_at)
  from public.partner_invitations i join public.partner_organizations o on o.id=i.organization_id
  where i.token_hash=p_token_hash and i.claimed_at is null and i.expires_at>now() and o.status='ACTIVE'
$$;

create or replace function public.claim_partner_invitation(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_email text; v_inv public.partner_invitations%rowtype; v_org_name text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select lower(email) into v_email from auth.users where id=v_user;
  select * into v_inv from public.partner_invitations
  where token_hash=p_token_hash and claimed_at is null and expires_at>now() for update;
  if v_inv.id is null then raise exception 'INVITATION_INVALID' using errcode='P0002'; end if;
  if lower(v_inv.email)<>v_email then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='42501'; end if;
  insert into public.partner_memberships(organization_id,user_id,role,status)
  values(v_inv.organization_id,v_user,v_inv.role,'ACTIVE')
  on conflict (organization_id,user_id) do update set role=excluded.role,status='ACTIVE';
  update public.partner_invitations set claimed_by=v_user,claimed_at=now() where id=v_inv.id;
  select name into v_org_name from public.partner_organizations where id=v_inv.organization_id;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id)
  values(v_user,'PARTNER','PARTNER_INVITATION_ACCEPTED','partner_organization',v_inv.organization_id);
  return jsonb_build_object('organizationId',v_inv.organization_id,'organizationName',v_org_name,'role',v_inv.role);
end $$;

drop function if exists public.create_partner_organization(text,text,text);
create or replace function public.create_partner_organization(
  p_name text,p_type text,p_admin_email text,p_invite_token_hash text,p_trusted_generation boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_role text; v_org public.partner_organizations%rowtype; v_partner_user uuid; v_membership public.partner_memberships%rowtype; v_invite public.partner_invitations%rowtype;
begin
  select role_code into v_role from public.internal_memberships where user_id=v_user and active;
  if v_role is null or v_role not in ('SUPER_ADMIN','OPERATIONS','PARTNER_MANAGER') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_type not in ('INSURANCE','CORPORATE','DISTRIBUTOR','OTHER') then raise exception 'INVALID_PARTNER_TYPE' using errcode='22023'; end if;
  if nullif(trim(p_name),'') is null or nullif(trim(p_admin_email),'') is null then raise exception 'INVALID_PARTNER' using errcode='22023'; end if;
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
  return jsonb_build_object('organization',to_jsonb(v_org),'membership',case when v_membership.id is null then null else to_jsonb(v_membership) end,'invitation',case when v_invite.id is null then null else jsonb_build_object('id',v_invite.id,'email',v_invite.email,'expiresAt',v_invite.expires_at) end);
end $$;

create or replace function public.create_code_batch(p_organization_id uuid,p_product_type text,p_idempotency_key text,p_codes jsonb)
returns table(batch_id uuid,batch_code text,created_count integer) language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_batch uuid; v_code_id uuid; v_batch_code text; v_item jsonb; v_count integer := jsonb_array_length(p_codes); v_actor text;
begin
  if v_user is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if exists(select 1 from public.internal_memberships where user_id=v_user and active and role_code in ('SUPER_ADMIN','OPERATIONS','CODE_PRODUCTION')) then v_actor:='ADMIN';
  elsif p_organization_id is not null and private.can_generate_for_partner(p_organization_id) then v_actor:='PARTNER';
  else raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if v_count<1 or v_count>1000 then raise exception 'INVALID_BATCH_SIZE' using errcode='22023'; end if;
  if p_organization_id is not null and not exists(select 1 from public.partner_organizations where id=p_organization_id and status='ACTIVE') then raise exception 'PARTNER_NOT_ACTIVE' using errcode='22023'; end if;
  select id,code_batches.batch_code into v_batch,v_batch_code from public.code_batches where idempotency_key=p_idempotency_key;
  if v_batch is not null then return query select v_batch,v_batch_code,(select generated_count from public.code_batches where id=v_batch); return; end if;
  v_batch_code := 'DOR-'||to_char(now(),'YY')||'-'||lpad(nextval('public.dorni_batch_number')::text,6,'0');
  insert into public.code_batches(batch_code,organization_id,product_type,quantity,generation_status,requested_by,approved_by,idempotency_key)
  values(v_batch_code,p_organization_id,p_product_type,v_count,'GENERATING',v_user,v_user,p_idempotency_key) returning id into v_batch;
  for v_item in select * from jsonb_array_elements(p_codes) loop
    insert into public.codes(batch_id,serial_number,public_token,product_type) values(v_batch,v_item->>'serialNumber',v_item->>'publicToken',p_product_type) returning id into v_code_id;
    insert into public.code_claims(code_id,credential_hash) values(v_code_id,v_item->>'credentialHash');
  end loop;
  update public.code_batches set generation_status='COMPLETED',generated_count=v_count,completed_at=now() where id=v_batch;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,v_actor,'BATCH_GENERATED','code_batch',v_batch,jsonb_build_object('quantity',v_count,'organizationId',p_organization_id));
  return query select v_batch,v_batch_code,v_count;
end $$;

create policy partner_invitations_internal_read on public.partner_invitations for select to authenticated using(private.is_internal() or claimed_by=(select auth.uid()));
create policy partner_codes_read on public.codes for select to authenticated using(
  exists(select 1 from public.code_batches b where b.id=codes.batch_id and b.organization_id is not null and private.is_partner_member(b.organization_id))
);
create policy partner_exports_read on public.production_exports for select to authenticated using(
  exists(select 1 from public.code_batches b where b.id=production_exports.batch_id and b.organization_id is not null and private.is_partner_member(b.organization_id))
);
create policy partner_exports_insert on public.production_exports for insert to authenticated with check(
  created_by=(select auth.uid()) and exists(select 1 from public.code_batches b where b.id=production_exports.batch_id and private.can_generate_for_partner(b.organization_id))
);
create policy partner_export_objects_select on storage.objects for select to authenticated using(
  bucket_id='production-exports' and exists(
    select 1 from public.production_exports e join public.code_batches b on b.id=e.batch_id
    where e.storage_path=name and b.organization_id is not null and private.is_partner_member(b.organization_id)
  )
);
create policy partner_export_objects_insert on storage.objects for insert to authenticated with check(
  bucket_id='production-exports' and private.is_partner_member((select b.organization_id from public.code_batches b where b.id=((storage.foldername(name))[1])::uuid))
);

grant select on public.partner_invitations to authenticated;
grant select on public.codes to authenticated;
grant select,insert on public.production_exports to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.can_generate_for_partner(uuid) to authenticated;

revoke all on function public.get_my_account_context(),public.preview_partner_invitation(text),public.claim_partner_invitation(text),public.create_partner_organization(text,text,text,text,boolean),public.create_code_batch(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_my_account_context(),public.claim_partner_invitation(text),public.create_partner_organization(text,text,text,text,boolean),public.create_code_batch(uuid,text,text,jsonb) to authenticated;
grant execute on function public.preview_partner_invitation(text) to anon,authenticated;

commit;
