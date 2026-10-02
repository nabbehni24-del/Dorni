begin;
alter table private.service_defaults add column expiring_soon_days integer not null default 7 check(expiring_soon_days between 0 and 365);
create table public.service_renewal_requests(
 id uuid primary key default gen_random_uuid(),service_id uuid not null references public.endpoint_services(id),
 requested_by uuid not null references public.profiles(id),plan_version_id uuid not null references public.service_plan_versions(id),
 status text not null default 'PENDING' check(status in ('PENDING','CONFIRMED','REJECTED')),
 created_at timestamptz not null default clock_timestamp(),resolved_at timestamptz,order_id uuid unique references public.service_orders(id),
 resolved_by uuid references public.profiles(id),reason text
);
create unique index renewal_one_pending on public.service_renewal_requests(service_id) where status='PENDING';
create index renewal_request_user on public.service_renewal_requests(requested_by);
create index renewal_request_version on public.service_renewal_requests(plan_version_id);
create index renewal_request_resolver on public.service_renewal_requests(resolved_by);
alter table public.service_renewal_requests enable row level security;
revoke all on public.service_renewal_requests from public,anon,authenticated;

-- Owner-only presentation: no public token, claim proof, internal policy or owner identity.
create function private.owner_service_view(p_code uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.commercial_user();c public.codes%rowtype;s public.endpoint_services%rowtype;v public.vehicles%rowtype;
 term public.service_plan_versions%rowtype;finish timestamptz;started timestamptz;label text;state text;days integer;
begin
 select x.* into v from public.vehicles x join public.code_assignments a on a.vehicle_id=x.id where a.code_id=p_code and a.ended_at is null and x.owner_id=u;
 if not found then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into c from public.codes where id=p_code;
 select * into s from public.endpoint_services where current_code_id=p_code;
 select max(ends_at),min(starts_at) into finish,started from public.service_periods where service_id=s.id;
 select ver.* into term from public.service_periods p join public.service_plan_versions ver on ver.id=p.plan_version_id
 where p.service_id=s.id order by (p.starts_at<=clock_timestamp() and p.ends_at>clock_timestamp()) desc,p.ends_at desc limit 1;
 select p.name into label from public.service_plans p where p.id=term.plan_id;
 select expiring_soon_days into days from private.service_defaults;
 state:=case when c.card_state<>'VALID' then 'UNAVAILABLE' when c.admin_suspended then 'SUSPENDED' when c.owner_paused then 'PAUSED'
 when finish<=clock_timestamp() then 'EXPIRED' when finish<=clock_timestamp()+make_interval(days=>days) then 'EXPIRING'
 when private.code_service_available(c.id) then 'ACTIVE' else 'UNAVAILABLE' end;
 return jsonb_build_object('codeId',c.id,'serial',c.serial_number,'vehicle',jsonb_build_object('id',v.id,'manufacturer',v.manufacturer,'model',v.model,'color',v.color),
 'status',state,'plan',coalesce(label,'خدمة بطاقتك الحالية'),'unit',term.duration_unit,'duration',term.duration_value,'startsAt',started,'expiresAt',finish,
 'renewable',s.id is not null and not coalesce(s.legacy_entitlement,false) and c.card_state='VALID','soonDays',days,
 'pending',(select jsonb_build_object('id',r.id,'status',r.status,'plan',p.name,'createdAt',r.created_at) from public.service_renewal_requests r join public.service_plan_versions ver on ver.id=r.plan_version_id join public.service_plans p on p.id=ver.plan_id where r.service_id=s.id and r.status='PENDING'));
end$$;
revoke all on function private.owner_service_view(uuid) from public,anon,authenticated;

create function private.activation_journey(p_action text,p_serial text,p_proof text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.commercial_user();c public.codes%rowtype;proof public.code_claims%rowtype;vehicle uuid;assignment uuid;version public.service_plan_versions%rowtype;label text;
begin
 if p_action not in ('preview','confirm') or p_action is null then raise exception 'INVALID_ACTION';end if;
 perform 1 from public.profiles where id=u for update;
 select * into c from public.codes where serial_number=upper(trim(p_serial)) for update;
 if not found then return jsonb_build_object('state','INVALID');end if;
 select * into proof from public.code_claims where code_id=c.id for update;
 if not found then return jsonb_build_object('state','INVALID');end if;
 if proof.locked_until>clock_timestamp() then return jsonb_build_object('state','INVALID');end if;
 if p_proof is null or p_proof !~ '^[a-f0-9]{64}$' or proof.credential_hash is distinct from p_proof then
  update public.code_claims set failed_attempts=case when locked_until is not null then 1 else least(failed_attempts,5)+1 end,
   locked_until=case when locked_until is null and failed_attempts+1>=5 then clock_timestamp()+interval '30 minutes' else null end where id=proof.id;
  return jsonb_build_object('state','INVALID');
 end if;
 if proof.claimed_at is not null then
  if proof.claimed_by=u and exists(select 1 from public.code_assignments a join public.vehicles v on v.id=a.vehicle_id where a.code_id=c.id and a.ended_at is null and v.owner_id=u) then
   return jsonb_build_object('state','OWNED','service',private.owner_service_view(c.id));
  end if;
  return jsonb_build_object('state','USED');
 end if;
 if c.card_state<>'VALID' or c.ownership_state<>'UNCLAIMED' then return jsonb_build_object('state','INVALID');end if;
 if c.admin_suspended then return jsonb_build_object('state','SUSPENDED');end if;
 select * into version from public.service_plan_versions where id=c.initial_plan_version_id;
 select name into label from public.service_plans where id=version.plan_id;
 if p_action='preview' then return jsonb_build_object('state','READY','serial',c.serial_number,'versionId',version.id,'plan',coalesce(label,'خدمة بطاقتك الحالية'),'unit',version.duration_unit,'duration',version.duration_value);end if;
 if c.initial_plan_version_id is distinct from nullif(p_data->>'versionId','')::uuid then return jsonb_build_object('state','TERMS_CHANGED');end if;
 vehicle:=nullif(p_data->>'vehicleId','')::uuid;
 if vehicle is not null then
  perform 1 from public.vehicles where id=vehicle and owner_id=u and archived_at is null for update;
  if not found then return jsonb_build_object('state','VEHICLE_UNAVAILABLE');end if;
  if exists(select 1 from public.code_assignments where vehicle_id=vehicle and ended_at is null) then return jsonb_build_object('state','VEHICLE_OCCUPIED');end if;
 else
  if coalesce(length(trim(p_data->>'manufacturer')),0) not between 1 and 80 or coalesce(length(trim(p_data->>'model')),0) not between 1 and 80 or coalesce(length(trim(p_data->>'color')),0) not between 1 and 40 then raise exception 'INVALID_VEHICLE';end if;
  insert into public.vehicles(owner_id,manufacturer,model,color) values(u,trim(p_data->>'manufacturer'),trim(p_data->>'model'),trim(p_data->>'color')) returning id into vehicle;
 end if;
 assignment:=public.claim_dorni_code(c.serial_number,p_proof,vehicle);
 -- A failed claim rolls back the just-created vehicle; bad proofs returned above
 -- commit attempt counters instead of throwing. All successful retries hit OWNED.
 if assignment is null then raise exception 'ACTIVATION_RETRY';end if;
 return jsonb_build_object('state','ACTIVATED','service',private.owner_service_view(c.id));
end$$;
revoke all on function private.activation_journey(text,text,text,jsonb) from public,anon;
grant execute on function private.activation_journey(text,text,text,jsonb) to authenticated;
create function public.activation_journey(p_action text,p_serial text,p_proof text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.activation_journey(p_action,p_serial,p_proof,p_data)$$;
revoke all on function public.activation_journey(text,text,text,jsonb) from public,anon;
grant execute on function public.activation_journey(text,text,text,jsonb) to authenticated;

create function private.owner_services(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.commercial_user();cid uuid;sid uuid;rid uuid;requested_version uuid;existing public.service_renewal_requests%rowtype;
begin
 if p_action='list' then return coalesce((select jsonb_agg(private.owner_service_view(a.code_id)) from public.code_assignments a join public.vehicles v on v.id=a.vehicle_id where v.owner_id=u and v.archived_at is null and a.ended_at is null),'[]');end if;
 cid:=(p_data->>'codeId')::uuid;
 perform private.owner_service_view(cid);
 if p_action='detail' then return private.owner_service_view(cid);end if;
 if p_action<>'request' or p_action is null then raise exception 'INVALID_ACTION';end if;
 -- Keep lock order compatible with replacement and the shared renewal engine.
 perform 1 from public.profiles where id=u for update;
 perform 1 from public.codes where id=cid and card_state='VALID' for share;
 if not found then raise exception 'SERVICE_NOT_RENEWABLE';end if;
 perform private.owner_service_view(cid);
 select id into sid from public.endpoint_services where current_code_id=cid and not legacy_entitlement for update;
 if not found then raise exception 'SERVICE_NOT_RENEWABLE';end if;
 requested_version:=(p_data->>'versionId')::uuid;
 if not exists(select 1 from public.service_plan_versions v join public.service_plans p on p.id=v.plan_id where v.id=requested_version and p.active) then raise exception 'INVALID_PLAN';end if;
 select * into existing from public.service_renewal_requests where service_id=sid and status='PENDING';
 if found then
  if existing.plan_version_id<>requested_version then raise exception 'PENDING_REQUEST_EXISTS';end if;
  return private.owner_service_view(cid);
 end if;
 insert into public.service_renewal_requests(service_id,requested_by,plan_version_id) values(sid,u,requested_version) returning id into rid;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(u,'OWNER','RENEWAL_REQUESTED','renewal_request',rid,jsonb_build_object('planVersion',requested_version));
 return private.owner_service_view(cid);
end$$;
revoke all on function private.owner_services(text,jsonb) from public,anon;
grant execute on function private.owner_services(text,jsonb) to authenticated;
create function public.owner_services(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.owner_services(p_action,p_data)$$;
revoke all on function public.owner_services(text,jsonb) from public,anon;
grant execute on function public.owner_services(text,jsonb) to authenticated;

create function private.manage_renewal_requests(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.service_admin();r public.service_renewal_requests%rowtype;cid uuid;oid uuid;v_reason text:=trim(p_data->>'reason');days integer;
begin
 if p_action='list' then return jsonb_build_object('soonDays',(select expiring_soon_days from private.service_defaults),'requests',coalesce((select jsonb_agg(x) from (select r.id,r.created_at,c.serial_number,p.name as plan from public.service_renewal_requests r join public.endpoint_services s on s.id=r.service_id join public.codes c on c.id=s.current_code_id join public.service_plan_versions v on v.id=r.plan_version_id join public.service_plans p on p.id=v.plan_id where r.status='PENDING' order by r.created_at limit 200) x),'[]'));end if;
 if p_action='threshold' then
  days:=(p_data->>'days')::integer;
  update private.service_defaults set expiring_soon_days=days;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,safe_metadata) values(u,'ADMIN','EXPIRY_NOTICE_SETTING','service_settings',jsonb_build_object('days',days));
  return jsonb_build_object('soonDays',days);
 end if;
 if p_action not in ('approve','reject') or p_action is null or coalesce(length(v_reason),0) not between 3 and 500 then raise exception 'INVALID_INPUT';end if;
 select * into r from public.service_renewal_requests where id=(p_data->>'id')::uuid for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if r.status<>'PENDING' then return jsonb_build_object('status',r.status);end if;
 if p_action='approve' then
  select current_code_id into cid from public.endpoint_services where id=r.service_id;
  oid:=private.create_service_order(cid,r.plan_version_id,null,'MANUAL_ADMIN','ADMIN','RENEWAL','renewal-request:'||r.id::text,v_reason);
  perform private.confirm_manual_service_order(oid);
 end if;
 update public.service_renewal_requests set status=case when p_action='approve' then 'CONFIRMED' else 'REJECTED' end,resolved_at=clock_timestamp(),resolved_by=u,order_id=oid,reason=v_reason where id=r.id returning * into r;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(u,'ADMIN','RENEWAL_REQUEST_'||r.status,'renewal_request',r.id,jsonb_build_object('reason',v_reason));
 return jsonb_build_object('status',r.status);
end$$;
revoke all on function private.manage_renewal_requests(text,jsonb) from public,anon;
grant execute on function private.manage_renewal_requests(text,jsonb) to authenticated;
create function public.manage_renewal_requests(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.manage_renewal_requests(p_action,p_data)$$;
revoke all on function public.manage_renewal_requests(text,jsonb) from public,anon;
grant execute on function public.manage_renewal_requests(text,jsonb) to authenticated;
commit;
