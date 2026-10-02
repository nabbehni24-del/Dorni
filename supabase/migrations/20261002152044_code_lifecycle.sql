begin;
-- Additive compatibility migration. No expiry or plan is assigned here.
lock table public.codes in share row exclusive mode;
alter table public.codes add column if not exists owner_paused boolean not null default false;
alter table public.codes
 add column card_state text not null default 'VALID' check(card_state in ('VALID','REVOKED','REPLACED')),
 add column service_state text not null default 'NOT_STARTED' check(service_state in ('NOT_STARTED','ENABLED')),
 add column service_policy text not null default 'LEGACY' check(service_policy in ('LEGACY','MANAGED')),
 add column admin_suspended boolean not null default false,
 add column first_activated_at timestamptz;

update public.codes c set
 card_state=case when activation_state in ('REVOKED','REPLACED') then activation_state else 'VALID' end,
 service_state=case when ownership_state='CLAIMED' then 'ENABLED' else 'NOT_STARTED' end,
 admin_suspended=activation_state='SUSPENDED' and not owner_paused,
 first_activated_at=(select claimed_at from public.code_claims where code_id=c.id);
-- Only subsequently issued codes use the managed policy. Every existing code,
-- including unclaimed stock, remains grandfathered. No historical date invented.
alter table public.codes alter column service_policy set default 'MANAGED';

create table private.code_lifecycle_events(
 id bigint generated always as identity primary key,
 code_id uuid not null references public.codes(id),
 actor_id uuid references public.profiles(id),
 occurred_at timestamptz not null default clock_timestamp(),
 before_state jsonb,
 after_state jsonb not null
);
create index code_lifecycle_events_code_time on private.code_lifecycle_events(code_id,occurred_at desc,id desc);
create index code_lifecycle_events_actor on private.code_lifecycle_events(actor_id);
alter table private.code_lifecycle_events enable row level security;
revoke all on private.code_lifecycle_events from public,anon,authenticated;

create function private.lifecycle_snapshot(c public.codes) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('cardState',c.card_state,'ownershipState',c.ownership_state,
 'serviceState',c.service_state,'servicePolicy',c.service_policy,'ownerPaused',c.owner_paused,
 'adminSuspended',c.admin_suspended,'firstActivatedAt',c.first_activated_at,'activationState',c.activation_state)
$$;
revoke all on function private.lifecycle_snapshot(public.codes) from public,anon,authenticated;

create function private.sync_code_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.service_policy is distinct from old.service_policy then raise exception 'POLICY_CONVERSION_REQUIRES_MIGRATION'; end if;
  if old.first_activated_at is not null and new.first_activated_at is distinct from old.first_activated_at then raise exception 'ACTIVATION_DATE_IMMUTABLE'; end if;
  if old.card_state<>'VALID' and (new.card_state<>old.card_state or new.activation_state<>old.activation_state) then raise exception 'TERMINAL_CARD'; end if;
  if old.service_state='ENABLED' and new.service_state='NOT_STARTED' then raise exception 'SERVICE_ALREADY_STARTED'; end if;
  -- Accept legacy write paths, but never let their ACTIVE request clear an admin hold.
  if new.activation_state is distinct from old.activation_state then
   if new.activation_state in ('REVOKED','REPLACED') then new.card_state:=new.activation_state;
   elsif new.activation_state='SUSPENDED' and not new.owner_paused then new.admin_suspended:=true;
   elsif new.activation_state='ACTIVE' and new.ownership_state='CLAIMED' then new.service_state:='ENABLED';
   end if;
  end if;
 end if;
 if new.service_state='ENABLED' and new.ownership_state<>'CLAIMED' then raise exception 'SERVICE_REQUIRES_CLAIM'; end if;
 if new.ownership_state='CLAIMED' and new.first_activated_at is null then
  select claimed_at into new.first_activated_at from public.code_claims where code_id=new.id;
 end if;
 new.activation_state:=case
  when new.card_state<>'VALID' then new.card_state
  when new.admin_suspended or new.owner_paused then 'SUSPENDED'
  when new.service_state='ENABLED' then 'ACTIVE'
  else 'INACTIVE' end;
 return new;
end $$;
revoke all on function private.sync_code_lifecycle() from public,anon,authenticated;
create trigger code_lifecycle_sync before insert or update on public.codes for each row execute function private.sync_code_lifecycle();

create function private.record_code_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior jsonb; next_state jsonb:=private.lifecycle_snapshot(new);
begin
 if tg_op='UPDATE' then prior:=private.lifecycle_snapshot(old); end if;
 if prior is distinct from next_state then
  insert into private.code_lifecycle_events(code_id,actor_id,before_state,after_state)
  values(new.id,auth.uid(),prior,next_state);
 end if;
 return new;
end $$;
revoke all on function private.record_code_lifecycle() from public,anon,authenticated;
create trigger code_lifecycle_history after insert or update on public.codes for each row execute function private.record_code_lifecycle();

-- Shared strict session gate for the new commercial RPCs.
create function private.commercial_user() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid text:=auth.jwt()->>'session_id';
begin
 if u is null or not exists(select 1 from auth.sessions where id::text=sid and user_id=u and (not_after is null or not_after>now()))
  or not exists(select 1 from public.profiles where id=u and account_status='ACTIVE') then
  raise exception 'AUTH_REQUIRED' using errcode='42501';
 end if;
 return u;
end $$;
revoke all on function private.commercial_user() from public,anon,authenticated;

create function private.manage_code_lifecycle(p_code_id uuid,p_action text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.commercial_user(); c public.codes%rowtype;
begin
 if not exists(select 1 from public.internal_memberships where user_id=u and active and role_code='SUPER_ADMIN') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_action is null or p_action not in ('SUSPEND','RESUME','REVOKE') or p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'INVALID_INPUT' using errcode='22023'; end if;
 select * into c from public.codes where id=p_code_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if c.card_state<>'VALID' then raise exception 'TERMINAL_CARD'; end if;
 update public.codes set admin_suspended=case when p_action='SUSPEND' then true when p_action='RESUME' then false else admin_suspended end,
 card_state=case when p_action='REVOKE' then 'REVOKED' else card_state end,
 revoked_at=case when p_action='REVOKE' then now() else revoked_at end
 where id=p_code_id returning * into c;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
 values(u,'ADMIN','CODE_'||p_action,'code',p_code_id,jsonb_build_object('reason',trim(p_reason)));
 return private.lifecycle_snapshot(c);
end $$;
revoke all on function private.manage_code_lifecycle(uuid,text,text) from public,anon;
grant execute on function private.manage_code_lifecycle(uuid,text,text) to authenticated;
create function public.manage_code_lifecycle(p_code_id uuid,p_action text,p_reason text) returns jsonb
language sql security invoker set search_path='' as $$ select private.manage_code_lifecycle(p_code_id,p_action,p_reason) $$;
revoke all on function public.manage_code_lifecycle(uuid,text,text) from public,anon;
grant execute on function public.manage_code_lifecycle(uuid,text,text) to authenticated;

create function private.code_lifecycle(p_code_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.commercial_user(); c public.codes%rowtype;
begin
 select * into c from public.codes where id=p_code_id;
 if not found then raise exception 'NOT_FOUND'; end if;
 if not exists(select 1 from public.internal_memberships where user_id=u and active and role_code='SUPER_ADMIN')
  and not exists(select 1 from public.code_assignments a join public.vehicles v on v.id=a.vehicle_id where a.code_id=c.id and a.ended_at is null and v.owner_id=u)
  and not exists(select 1 from public.code_batches b join public.partner_memberships m on m.organization_id=b.organization_id join public.partner_organizations o on o.id=m.organization_id where b.id=c.batch_id and m.user_id=u and m.status='ACTIVE' and o.status='ACTIVE')
 then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 return jsonb_build_object('id',c.id,'serialNumber',c.serial_number,'state',private.lifecycle_snapshot(c),'history',
  (select coalesce(jsonb_agg(e order by e.id desc),'[]'::jsonb) from (select id,occurred_at,before_state,after_state from private.code_lifecycle_events where code_id=c.id order by id desc limit 100) e));
end $$;
revoke all on function private.code_lifecycle(uuid) from public,anon;
grant execute on function private.code_lifecycle(uuid) to authenticated;
create function public.code_lifecycle(p_code_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.code_lifecycle(p_code_id)$$;
revoke all on function public.code_lifecycle(uuid) from public,anon;
grant execute on function public.code_lifecycle(uuid) to authenticated;

comment on column public.codes.activation_state is 'Compatibility projection of card_state, service_state and independent holds; never use as ownership or plan.';
comment on column public.codes.service_policy is 'LEGACY codes have no automatic expiry; MANAGED service terms are implemented in the later Service/Renewal stage.';
commit;
