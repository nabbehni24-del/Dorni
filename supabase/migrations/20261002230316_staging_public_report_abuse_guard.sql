-- Per-card abuse ceiling cannot be bypassed by spoofing caller-supplied session/IP hashes.
-- Exact request retries are checked before the limit and do not consume another slot.
begin;
create table private.report_rate_limits(singleton boolean primary key default true check(singleton),per_code_minute integer not null check(per_code_minute between 1 and 10000),per_code_day integer not null check(per_code_day>=per_code_minute));
alter table private.report_rate_limits enable row level security;
revoke all on private.report_rate_limits from public,anon,authenticated,service_role;
insert into private.report_rate_limits values(true,60,1000);
create index report_access_tokens_report_created_idx on private.report_access_tokens(report_id,created_at);
CREATE OR REPLACE FUNCTION public.submit_public_report(p_public_token text, p_report_type text, p_session_hash text, p_status_token_hash text, p_ip_hash text DEFAULT NULL::text, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric)
 RETURNS TABLE(report_id uuid, aggregated boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_code uuid; v_vehicle uuid; v_session uuid; v_report uuid; v_recent uuid; v_expiry timestamptz; v_access private.report_access_tokens; v_limits private.report_rate_limits%rowtype;
begin
 if coalesce(p_status_token_hash,'') !~ '^[a-f0-9]{64}$' or coalesce(p_session_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT';end if;
 if p_public_token is null or length(p_public_token)>200 or p_report_type is null or length(p_report_type)>80 or (p_ip_hash is not null and p_ip_hash !~ '^[a-f0-9]{64}$')
 or (p_latitude is null)<>(p_longitude is null) or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'INVALID_INPUT' using errcode='22023';end if;
 -- Serialize identical retries, then submissions on the same code. No lock-order inversion.
 perform pg_advisory_xact_lock(hashtextextended('report-token:'||p_status_token_hash,0));
 select c.id,a.vehicle_id into v_code,v_vehicle from public.codes c join public.code_assignments a on a.code_id=c.id and a.ended_at is null
 where c.public_token=p_public_token and private.code_service_available(c.id) and not c.owner_paused for share;
 if v_code is null then raise exception 'CODE_NOT_ACTIVE' using errcode='P0002';end if;
 if not exists(select 1 from public.report_types where code=p_report_type and is_active) then raise exception 'INVALID_REPORT_TYPE' using errcode='22023';end if;
 select * into v_access from private.report_access_tokens where token_hash=p_status_token_hash;
 if found then
  if v_access.session_hash<>p_session_hash or not exists(select 1 from public.reports r where r.id=v_access.report_id and r.code_id=v_code and r.report_type_code=p_report_type) then raise exception 'REQUEST_CONFLICT';end if;
  if v_access.expires_at<=now() then raise exception 'REQUEST_EXPIRED';end if;
  return query select v_access.report_id,(select duplicate_count>1 from public.reports where id=v_access.report_id);return;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('report-code:'||v_code::text,0));
 select * into v_limits from private.report_rate_limits where singleton;
 if not found then raise exception 'REPORT_RATE_CONFIGURATION_MISSING';end if;
 if (select count(*) from private.report_access_tokens t join public.reports r on r.id=t.report_id where r.code_id=v_code and t.created_at>now()-interval '1 minute')>=v_limits.per_code_minute
 or (select count(*) from private.report_access_tokens t join public.reports r on r.id=t.report_id where r.code_id=v_code and t.created_at>now()-interval '1 day')>=v_limits.per_code_day
 then raise exception 'REPORT_RATE_LIMITED' using errcode='P0001';end if;
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
end $function$;
commit;
