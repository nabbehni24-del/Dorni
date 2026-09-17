-- Narrow, auditable RPCs let the hosted app operate without exposing a service-role key.
create table if not exists private.runtime_secrets (
  name text primary key,
  sha256_hex text not null check (sha256_hex ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

insert into private.runtime_secrets(name, sha256_hex) values
  ('cron', '3adbcb1519eed52620555376bcb9b4e79f55696777b931dafcb3dbd98a4aabea'),
  ('bootstrap', 'c5c09729d850e4a3c8998b2d2b9ddd436da2a00af4c96f1f1d87aaf2867979d4')
on conflict (name) do update set sha256_hex=excluded.sha256_hex;

create or replace function private.runtime_secret_matches(p_name text,p_secret text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.runtime_secrets where name=p_name and sha256_hex=encode(extensions.digest(coalesce(p_secret,''),'sha256'),'hex'))
$$;

create or replace function public.get_my_internal_role()
returns text language sql stable security definer set search_path='' as $$
 select role_code from public.internal_memberships where user_id=(select auth.uid()) and active
$$;

create or replace function public.bootstrap_dorni_admin(p_token text)
returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid());
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not private.runtime_secret_matches('bootstrap',p_token) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if exists(select 1 from public.internal_memberships where active) then raise exception 'ALREADY_BOOTSTRAPPED' using errcode='23505'; end if;
 insert into public.internal_memberships(user_id,role_code,active) values(v_user,'SUPER_ADMIN',true);
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id) values(v_user,'ADMIN','ADMIN_BOOTSTRAPPED','internal_membership',v_user);
 return 'SUPER_ADMIN';
end $$;

create or replace function public.get_admin_overview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_role text; v_result jsonb;
begin
 select role_code into v_role from public.internal_memberships where user_id=(select auth.uid()) and active;
 if v_role is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select jsonb_build_object(
  'role',v_role,
  'metrics',jsonb_build_object('owners',(select count(*) from public.profiles),'vehicles',(select count(*) from public.vehicles),'codes',(select count(*) from public.codes),'reports',(select count(*) from public.reports),'partners',(select count(*) from public.partner_organizations),'support',(select count(*) from public.support_tickets),'batches',(select count(*) from public.code_batches)),
  'organizations',coalesce((select jsonb_agg(x) from (select id,name,type,status,trusted_generation,created_at from public.partner_organizations order by created_at desc limit 20)x),'[]'::jsonb),
  'recentBatches',coalesce((select jsonb_agg(x) from (select id,batch_code,quantity,generated_count,generation_status,production_status,distribution_status,organization_id,created_at from public.code_batches order by created_at desc limit 20)x),'[]'::jsonb),
  'recentReports',coalesce((select jsonb_agg(x) from (select id,report_type_code,status,duplicate_count,created_at from public.reports order by created_at desc limit 20)x),'[]'::jsonb),
  'supportTickets',coalesce((select jsonb_agg(x) from (select id,subject,category,status,created_at from public.support_tickets order by created_at desc limit 20)x),'[]'::jsonb)
 ) into v_result;
 return v_result;
end $$;

create or replace function public.create_partner_organization(p_name text,p_type text,p_admin_phone text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_role text; v_org public.partner_organizations%rowtype; v_partner_user uuid; v_membership public.partner_memberships%rowtype;
begin
 select role_code into v_role from public.internal_memberships where user_id=v_user and active;
 if v_role is null or v_role not in ('SUPER_ADMIN','OPERATIONS','PARTNER_MANAGER') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_type not in ('INSURANCE','CORPORATE','DISTRIBUTOR','OTHER') then raise exception 'INVALID_PARTNER_TYPE' using errcode='22023'; end if;
 insert into public.partner_organizations(name,type,status) values(trim(p_name),p_type,'ACTIVE') returning * into v_org;
 if nullif(trim(coalesce(p_admin_phone,'')),'') is not null then
  select id into v_partner_user from auth.users where phone=p_admin_phone limit 1;
  if v_partner_user is not null then
   insert into public.partner_memberships(organization_id,user_id,role,status) values(v_org.id,v_partner_user,'PARTNER_ADMIN','ACTIVE') returning * into v_membership;
  end if;
 end if;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id) values(v_user,'ADMIN','PARTNER_CREATED','partner_organization',v_org.id);
 return jsonb_build_object('organization',to_jsonb(v_org),'membership',case when v_membership.id is null then null else to_jsonb(v_membership) end,'userMustRegister',p_admin_phone is not null and v_partner_user is null);
end $$;

create or replace function public.dequeue_notification_messages(p_secret text,p_limit integer default 50)
returns table(id uuid,recipient_id uuid,channel text,template_code text,report_id uuid,destination text)
language plpgsql security definer set search_path='' as $$
begin
 if not private.runtime_secret_matches('cron',p_secret) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 return query with picked as (
  select m.id from public.notification_messages m where m.status='QUEUED' and m.scheduled_at<=now() order by m.created_at for update skip locked limit greatest(1,least(p_limit,100))
 ), updated as (
  update public.notification_messages m set status='SENDING' from picked where m.id=picked.id returning m.id,m.recipient_id,m.channel,m.template_code,m.report_id
 ) select u.id,u.recipient_id,u.channel,u.template_code,u.report_id,case when u.channel='IN_APP' then null else (select c.destination from public.contact_methods c where c.user_id=u.recipient_id and c.kind=u.channel and c.enabled and c.verified_at is not null limit 1) end from updated u;
end $$;

create or replace function public.complete_notification_message(p_secret text,p_message_id uuid,p_provider text,p_reference text,p_status text,p_error_code text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.runtime_secret_matches('cron',p_secret) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_status not in ('SENT','DELIVERED','FAILED') then raise exception 'INVALID_STATUS' using errcode='22023'; end if;
 insert into public.notification_attempts(message_id,provider,provider_reference,status,error_code) values(p_message_id,p_provider,p_reference,p_status,p_error_code);
 update public.notification_messages set status=p_status where id=p_message_id;
end $$;

create policy internal_exports_select on public.production_exports for select to authenticated using(private.is_internal());
create policy internal_exports_insert on public.production_exports for insert to authenticated with check(private.is_internal() and created_by=(select auth.uid()));
create policy internal_exports_update on public.production_exports for update to authenticated using(private.is_internal()) with check(private.is_internal());
create policy internal_audit_insert on public.audit_logs for insert to authenticated with check(private.is_internal() and actor_id=(select auth.uid()));
create policy internal_export_objects_select on storage.objects for select to authenticated using(bucket_id='production-exports' and private.is_internal());
create policy internal_export_objects_insert on storage.objects for insert to authenticated with check(bucket_id='production-exports' and private.is_internal());

grant select,insert,update on public.production_exports to authenticated;
grant insert on public.audit_logs to authenticated;
revoke all on function public.get_my_internal_role(),public.bootstrap_dorni_admin(text),public.get_admin_overview(),public.create_partner_organization(text,text,text),public.dequeue_notification_messages(text,integer),public.complete_notification_message(text,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.get_my_internal_role(),public.bootstrap_dorni_admin(text),public.get_admin_overview(),public.create_partner_organization(text,text,text) to authenticated;
grant execute on function public.dequeue_notification_messages(text,integer),public.complete_notification_message(text,uuid,text,text,text,text) to anon,authenticated;
revoke all on function private.runtime_secret_matches(text,text) from public,anon,authenticated;
