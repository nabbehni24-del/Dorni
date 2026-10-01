-- Retain every reporter capability instead of replacing the original during aggregation.
create table private.report_access_tokens (
 token_hash text primary key,
 report_id uuid not null references public.reports(id) on delete cascade,
 session_hash text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null
);
create index report_access_tokens_report on private.report_access_tokens(report_id);
alter table private.report_access_tokens enable row level security;
revoke all on private.report_access_tokens from public,anon,authenticated;
insert into private.report_access_tokens(token_hash,report_id,session_hash,created_at,expires_at)
 select r.status_token_hash,r.id,s.session_hash,r.created_at,r.expires_at from public.reports r join public.scanner_sessions s on s.id=r.scanner_session_id;
alter table public.reports add column live_topic uuid not null default gen_random_uuid();
create index reports_aggregation_lookup on public.reports(code_id,report_type_code,created_at desc) where status in ('ACTIVE','ACKNOWLEDGED');

create or replace function public.submit_public_report(p_public_token text,p_report_type text,p_session_hash text,p_status_token_hash text,p_ip_hash text default null,p_latitude numeric default null,p_longitude numeric default null)
returns table(report_id uuid,aggregated boolean) language plpgsql security definer set search_path='' as $$
declare v_code uuid; v_vehicle uuid; v_session uuid; v_report uuid; v_recent uuid; v_expiry timestamptz; v_access private.report_access_tokens;
begin
 if coalesce(p_status_token_hash,'') !~ '^[a-f0-9]{64}$' or coalesce(p_session_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
 -- Serialize identical retries, then submissions on the same code. No lock-order inversion.
 perform pg_advisory_xact_lock(hashtextextended('report-token:'||p_status_token_hash,0));
 select c.id,a.vehicle_id into v_code,v_vehicle from public.codes c join public.code_assignments a on a.code_id=c.id and a.ended_at is null
 where c.public_token=p_public_token and c.activation_state='ACTIVE' and not c.owner_paused for share;
 if v_code is null then raise exception 'CODE_NOT_ACTIVE' using errcode='P0002';end if;
 if not exists(select 1 from public.report_types where code=p_report_type and is_active) then raise exception 'INVALID_REPORT_TYPE' using errcode='22023';end if;
 select * into v_access from private.report_access_tokens where token_hash=p_status_token_hash;
 if found then
  if v_access.session_hash<>p_session_hash or not exists(select 1 from public.reports r where r.id=v_access.report_id and r.code_id=v_code and r.report_type_code=p_report_type) then raise exception 'REQUEST_CONFLICT';end if;
  if v_access.expires_at<=now() then raise exception 'REQUEST_EXPIRED';end if;
  return query select v_access.report_id,(select duplicate_count>1 from public.reports where id=v_access.report_id);return;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('report-code:'||v_code::text,0));
 select r.id,r.expires_at into v_recent,v_expiry from public.reports r
 where r.code_id=v_code and r.vehicle_id=v_vehicle and r.report_type_code=p_report_type and r.status in ('ACTIVE','ACKNOWLEDGED') and r.created_at>now()-interval '5 minutes' and r.expires_at>now()
 order by r.created_at desc limit 1 for update;
 if v_recent is not null then
  insert into private.report_access_tokens(token_hash,report_id,session_hash,expires_at) values(p_status_token_hash,v_recent,p_session_hash,v_expiry);
  update public.reports set duplicate_count=duplicate_count+1 where id=v_recent;
  insert into public.report_events(report_id,event_type,safe_metadata) values(v_recent,'REPORT_AGGREGATED',jsonb_build_object('count',1));
  return query select v_recent,true;return;
 end if;
 insert into public.scanner_sessions(code_id,session_hash,ip_hash,expires_at) values(v_code,p_session_hash,p_ip_hash,now()+interval '72 hours') returning id into v_session;
 insert into public.reports(code_id,vehicle_id,scanner_session_id,report_type_code,status,status_token_hash,latitude,longitude,location_expires_at,expires_at)
 values(v_code,v_vehicle,v_session,p_report_type,'ACTIVE',p_status_token_hash,p_latitude,p_longitude,case when p_latitude is not null then now()+interval '24 hours' end,now()+interval '72 hours') returning id,expires_at into v_report,v_expiry;
 insert into private.report_access_tokens(token_hash,report_id,session_hash,expires_at) values(p_status_token_hash,v_report,p_session_hash,v_expiry);
 insert into public.report_events(report_id,event_type) values(v_report,'REPORT_CREATED');
 insert into public.notification_messages(report_id,recipient_id,channel,template_code) select v_report,v.owner_id,'IN_APP','REPORT_CREATED' from public.vehicles v where v.id=v_vehicle;
 insert into public.notification_messages(report_id,recipient_id,channel,template_code) select v_report,v.owner_id,n.primary_channel,'REPORT_CREATED' from public.vehicles v join public.notification_preferences n on n.user_id=v.owner_id where v.id=v_vehicle and n.primary_channel<>'IN_APP';
 return query select v_report,false;
end $$;

create or replace function public.get_public_report_status(p_status_token_hash text)
returns table(report_type_code text,status text,owner_response text,created_at timestamptz,updated_at timestamptz,expires_at timestamptz)
language sql stable security definer set search_path='' as $$
 select r.report_type_code,r.status,r.owner_response,r.created_at,r.updated_at,r.expires_at from public.reports r
 where r.expires_at>now() and (r.status_token_hash=p_status_token_hash or r.id=(select a.report_id from private.report_access_tokens a where a.token_hash=p_status_token_hash and a.expires_at>now())) limit 1
$$;

-- Keep current support rules, but resolve all aliases and avoid row locks on reads.
do $$ declare d text; needle text; begin
 d:=pg_get_functiondef('private.report_support(text,text)'::regprocedure);
 needle:='select * into r from public.reports where status_token_hash=p_hash and expires_at>now() for update;';
 if strpos(d,needle)=0 then raise exception 'Unexpected report support lookup';end if;
 d:=replace(d,needle,'select * into r from public.reports where expires_at>now() and (status_token_hash=p_hash or id=(select a.report_id from private.report_access_tokens a where a.token_hash=p_hash and a.expires_at>now()));
 if found and p_action=''escalate'' then select * into r from public.reports where id=r.id and expires_at>now() for update;end if;');
 d:=replace(d,'''reportType'',r.report_type_code','''serverNow'',clock_timestamp(),''liveTopic'',''report:''||r.live_topic::text,''reference'',upper(left(r.id::text,8)),''vehicle'',(select jsonb_build_object(''manufacturer'',v.manufacturer,''model'',v.model,''color'',v.color) from public.vehicles v where v.id=r.vehicle_id),''reportType'',r.report_type_code');
 execute d;
end $$;

-- A broadcast is only an invalidation signal. No row, message or credential is published.
create function private.broadcast_report_refresh() returns trigger language plpgsql security definer set search_path='' as $$
declare rid uuid; topic uuid;
begin
 if tg_table_name='reports' then
  if old.status is not distinct from new.status and old.owner_response is not distinct from new.owner_response then return new;end if;
  rid:=new.id;
 elsif tg_table_name='support_tickets' then
  if new.category<>'PUBLIC_REPORT' then return new;end if;
  rid:=new.report_id;
 else
  if new.is_internal then return new;end if;
  select report_id into rid from public.support_tickets where id=new.ticket_id and category='PUBLIC_REPORT';
 end if;
 select live_topic into topic from public.reports where id=rid and expires_at>now();
 if topic is not null then perform realtime.send('{}'::jsonb,'refresh','report:'||topic::text,false);end if;
 return new;
exception when others then
 -- Optional live transport must never roll back a saved owner/staff response.
 raise warning 'REPORT_LIVE_SIGNAL_FAILED';return new;
end $$;
revoke all on function private.broadcast_report_refresh() from public,anon,authenticated;
create trigger report_refresh after update of status,owner_response on public.reports for each row execute function private.broadcast_report_refresh();
create trigger report_ticket_refresh after insert or update of status on public.support_tickets for each row execute function private.broadcast_report_refresh();
create trigger report_message_refresh after insert on public.support_messages for each row execute function private.broadcast_report_refresh();
