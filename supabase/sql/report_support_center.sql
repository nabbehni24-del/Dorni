-- Public reporters hold an expiring, unguessable report capability, not an account.
create table private.support_center_settings (
 id boolean primary key default true check(id),
 config jsonb not null,
 updated_at timestamptz not null default now()
);
alter table private.support_center_settings enable row level security;
revoke all on private.support_center_settings from public,anon,authenticated;
insert into private.support_center_settings(config) values ('{"enabled":true,"escalationMinutes":2,"callMinutes":5,"hours":"","instructions":"","phones":[]}');

create function private.support_center_admin(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare x jsonb;
begin
 if not private.support_allowed('view') or not exists(select 1 from public.internal_memberships where user_id=auth.uid() and active and role_code='SUPER_ADMIN') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_action='get' then return (select config from private.support_center_settings where id); end if;
 if p_action<>'save' then raise exception 'INVALID_INPUT'; end if;
 if jsonb_typeof(p_data->'enabled') is distinct from 'boolean'
 or jsonb_typeof(p_data->'phones') is distinct from 'array'
 or jsonb_typeof(p_data->'hours') is distinct from 'string'
 or jsonb_typeof(p_data->'instructions') is distinct from 'string'
 or coalesce(p_data->>'escalationMinutes','') !~ '^[0-9]{1,4}$'
 or coalesce(p_data->>'callMinutes','') !~ '^[0-9]{1,4}$' then raise exception 'INVALID_INPUT'; end if;
 if (p_data->>'escalationMinutes')::int not between 0 and 1440 or (p_data->>'callMinutes')::int not between 0 and 1440
 or length(p_data->>'hours')>200 or length(p_data->>'instructions')>600 or jsonb_array_length(p_data->'phones')>8 then raise exception 'INVALID_INPUT'; end if;
 for x in select value from jsonb_array_elements(p_data->'phones') loop
  if jsonb_typeof(x->'label') is distinct from 'string' or length(trim(x->>'label')) not between 1 and 60
   or coalesce(x->>'number','') !~ '^\+?[0-9]{5,15}$' then raise exception 'INVALID_INPUT'; end if;
 end loop;
 update private.support_center_settings set config=jsonb_build_object('enabled',p_data->'enabled','escalationMinutes',p_data->'escalationMinutes','callMinutes',p_data->'callMinutes','hours',p_data->>'hours','instructions',p_data->>'instructions','phones',p_data->'phones'),updated_at=now() where id;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,safe_metadata) values(auth.uid(),'ADMIN','SUPPORT_CENTER_SETTINGS','support_center',jsonb_build_object('enabled',p_data->'enabled','phoneCount',jsonb_array_length(p_data->'phones')));
 return (select config from private.support_center_settings where id);
end $$;
revoke all on function private.support_center_admin(text,jsonb) from public,anon;
grant execute on function private.support_center_admin(text,jsonb) to authenticated;
create function public.support_center_admin(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.support_center_admin(p_action,p_data) $$;
revoke all on function public.support_center_admin(text,jsonb) from public,anon;
grant execute on function public.support_center_admin(text,jsonb) to authenticated;

alter table public.support_tickets alter column requester_id drop not null;
alter table public.support_tickets add constraint support_reporter_identity check(requester_id is not null or (category='PUBLIC_REPORT' and report_id is not null));
create unique index support_public_report_once on public.support_tickets(report_id) where category='PUBLIC_REPORT';

create function private.report_support(p_hash text,p_action text default 'status') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.reports; t public.support_tickets; c jsonb; allowed boolean; callable boolean; escalation_at timestamptz; call_at timestamptz;
begin
 if p_action not in ('status','escalate') then raise exception 'INVALID_INPUT'; end if;
 -- Lock serializes repeat escalation requests. No IDs supplied by the browser are trusted.
 select * into r from public.reports where status_token_hash=p_hash and expires_at>now() for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select config into c from private.support_center_settings where id;
 select * into t from public.support_tickets where report_id=r.id and category='PUBLIC_REPORT';
 escalation_at:=r.created_at+make_interval(mins=>(c->>'escalationMinutes')::int);
 allowed:=(c->>'enabled')::boolean and r.status in ('CREATED','ACTIVE','ACKNOWLEDGED') and (r.owner_response is null or r.owner_response='CANNOT_REACH_NOW') and now()>=escalation_at;
 if p_action='escalate' and t.id is null then
  if not allowed then raise exception 'NOT_READY'; end if;
  insert into public.support_tickets(requester_id,category,subject,description,report_id,vehicle_id,code_id)
  values(null,'PUBLIC_REPORT','متابعة بلاغ سيارة','طلب المبلّغ مساعدة الدعم في متابعة البلاغ.',r.id,r.vehicle_id,r.code_id) returning * into t;
  insert into public.report_events(report_id,event_type,safe_metadata) values(r.id,'SUPPORT_ESCALATED',jsonb_build_object('ticketId',t.id));
 end if;
 call_at:=t.created_at+make_interval(mins=>(c->>'callMinutes')::int);
 callable:=coalesce((c->>'enabled')::boolean and t.id is not null and t.status not in ('CLOSED','RESOLVED') and r.status not in ('RESOLVED','BLOCKED','EXPIRED') and now()>=call_at
  and jsonb_array_length(c->'phones')>0 and not exists(select 1 from public.support_messages where ticket_id=t.id and not is_internal),false);
 return jsonb_build_object('reportType',r.report_type_code,'status',r.status,'ownerResponse',r.owner_response,'createdAt',r.created_at,'updatedAt',r.updated_at,'expiresAt',r.expires_at,
 'support',jsonb_build_object('enabled',c->'enabled','canEscalate',allowed and t.id is null,'escalationAt',escalation_at,
 'ticket',case when t.id is not null then jsonb_build_object('id',t.id,'status',t.status,'createdAt',t.created_at) else null end,
 'messages',(select coalesce(jsonb_agg(m order by m."createdAt",m.id),'[]') from (select id,body,created_at as "createdAt" from public.support_messages where ticket_id=t.id and not is_internal order by created_at desc,id desc limit 100) m),
 'canCall',callable,'callAt',call_at,'contact',case when callable then jsonb_build_object('phones',c->'phones','hours',c->>'hours','instructions',c->>'instructions') else null end));
end $$;
revoke all on function private.report_support(text,text) from public;
-- Schema lookup only; table access remains revoked and the schema is not exposed.
grant usage on schema private to anon,service_role;
grant execute on function private.report_support(text,text) to anon,authenticated,service_role;
create function public.report_support(p_hash text,p_action text default 'status') returns jsonb language sql security invoker set search_path='' as $$ select private.report_support(p_hash,p_action) $$;
revoke all on function public.report_support(text,text) from public;
grant execute on function public.report_support(text,text) to anon,authenticated,service_role;

-- Keep capability-scoped staff access, and include anonymous reporters in inbox joins.
do $$ declare d text; begin
 d:=pg_get_functiondef('private.support_workspace(text,jsonb)'::regprocedure);
 if strpos(d,'join public.profiles p on p.id=t.requester_id')=0 then raise exception 'Unexpected support workspace'; end if;
 d:=replace(d,'join public.profiles p on p.id=t.requester_id','left join public.profiles p on p.id=t.requester_id');
 d:=replace(d,'p.full_name as requester_name','coalesce(p.full_name,''مبلّغ عن سيارة'') as requester_name');
 d:=replace(d,'''requester_name'',p.full_name','''requester_name'',coalesce(p.full_name,''مبلّغ عن سيارة''),''report_context'',(select jsonb_build_object(''reportId'',r.id,''type'',r.report_type_code,''status'',r.status,''ownerResponse'',r.owner_response,''createdAt'',r.created_at,''serial'',c.serial_number,''vehicle'',v.manufacturer||'' ''||v.model||'' · ''||v.color,''ownerId'',v.owner_id,''ownerName'',p2.full_name) from public.reports r join public.codes c on c.id=r.code_id join public.vehicles v on v.id=r.vehicle_id join public.profiles p2 on p2.id=v.owner_id where r.id=t.report_id)');
 execute d;
end $$;
