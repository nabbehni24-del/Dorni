-- Dorni only. Apply as named migration dorni_web_push through the hosted MCP.
-- CLI migration creation is unavailable in the current Windows sandbox.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table private.push_settings (
  singleton boolean primary key default true check(singleton),
  public_key text not null,
  private_key_secret uuid not null,
  worker_token_secret uuid not null,
  worker_url text not null,
  enabled boolean not null default false
);
alter table private.push_settings enable row level security;
create table private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.push_subscriptions enable row level security;
create index push_subscriptions_owner on private.push_subscriptions(user_id,session_id) where enabled;
create table private.push_jobs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references private.push_subscriptions(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  message_id uuid references public.notification_messages(id) on delete cascade,
  report_id uuid references public.reports(id) on delete cascade,
  state text not null default 'QUEUED' check(state in ('QUEUED','SENDING','SENT','FAILED','CANCELLED')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  last_status integer,
  created_at timestamptz not null default now(),
  unique(message_id,subscription_id)
);
alter table private.push_jobs enable row level security;
create index push_jobs_ready on private.push_jobs(next_attempt_at) where state in ('QUEUED','SENDING');
create index push_jobs_subscription on private.push_jobs(subscription_id,created_at);
create index push_jobs_recipient on private.push_jobs(recipient_id);
create index push_jobs_report on private.push_jobs(report_id);
revoke all on private.push_settings,private.push_subscriptions,private.push_jobs from public,anon,authenticated;

create function private.push_device(p_action text,p_endpoint text default null,p_p256dh text default null,p_auth text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); s uuid := nullif(auth.jwt()->>'session_id','')::uuid; sub private.push_subscriptions%rowtype; cfg private.push_settings%rowtype;
begin
 if u is null or s is null or not exists(select 1 from auth.sessions where id=s and user_id=u) then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into cfg from private.push_settings where singleton;
 -- Serialize account changes to enforce the per-account device cap and test rate limit.
 perform 1 from public.profiles where id=u for update;
 if p_action='status' then
   return jsonb_build_object('configured',coalesce(cfg.enabled,false),'publicKey',case when cfg.enabled then cfg.public_key end,'active',exists(select 1 from private.push_subscriptions where user_id=u and session_id=s and endpoint=p_endpoint and enabled));
 elsif p_action='logout' then
   update private.push_subscriptions set enabled=false,updated_at=now() where user_id=u and session_id=s;
   return jsonb_build_object('ok',true);
 elsif p_action='disable' then
   update private.push_subscriptions set enabled=false,updated_at=now() where user_id=u and session_id=s and endpoint=p_endpoint;
   return jsonb_build_object('ok',true);
 end if;
 if not coalesce(cfg.enabled,false) then raise exception 'PUSH_NOT_CONFIGURED'; end if;
 if p_action='subscribe' then
   if p_endpoint is null or length(p_endpoint)>2048 or p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-zA-Z0-9-]+\.notify\.windows\.com)/[^[:space:]]+$'
      or coalesce(p_p256dh,'') !~ '^[A-Za-z0-9_-]{87}$' or coalesce(p_auth,'') !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'INVALID_SUBSCRIPTION'; end if;
   if (select count(*) from private.push_subscriptions where user_id=u and enabled and endpoint<>p_endpoint)>=10 then raise exception 'DEVICE_LIMIT'; end if;
   insert into private.push_subscriptions(user_id,session_id,endpoint,p256dh,auth_key) values(u,s,p_endpoint,p_p256dh,p_auth)
   on conflict(endpoint) do update set user_id=u,session_id=s,p256dh=p_p256dh,auth_key=p_auth,enabled=true,updated_at=now();
   return jsonb_build_object('ok',true);
 elsif p_action='test' then
   select * into sub from private.push_subscriptions where user_id=u and session_id=s and endpoint=p_endpoint and enabled for update;
   if sub.id is null then raise exception 'SUBSCRIPTION_MISSING'; end if;
   if exists(select 1 from private.push_jobs where subscription_id=sub.id and report_id is null and created_at>now()-interval '1 minute') then raise exception 'TEST_RATE_LIMIT'; end if;
   insert into private.push_jobs(subscription_id,recipient_id,session_id) values(sub.id,u,s);
   return jsonb_build_object('queued',true);
 end if;
 raise exception 'INVALID_ACTION';
end $$;
revoke all on function private.push_device(text,text,text,text) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.push_device(text,text,text,text) to authenticated;
create function public.push_device(p_action text,p_endpoint text default null,p_p256dh text default null,p_auth text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.push_device(p_action,p_endpoint,p_p256dh,p_auth) $$;
revoke all on function public.push_device(text,text,text,text) from public,anon;
grant execute on function public.push_device(text,text,text,text) to authenticated;

create function private.enqueue_report_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.channel='IN_APP' and new.template_code='REPORT_CREATED' then
   insert into private.push_jobs(subscription_id,recipient_id,session_id,message_id,report_id)
   select s.id,s.user_id,s.session_id,new.id,new.report_id from private.push_subscriptions s
   join auth.sessions a on a.id=s.session_id and a.user_id=s.user_id
   where s.user_id=new.recipient_id and s.enabled;
 end if;
 return new;
end $$;
revoke all on function private.enqueue_report_push() from public,anon,authenticated;
create trigger dorni_enqueue_push after insert on public.notification_messages for each row execute function private.enqueue_report_push();

create function private.wake_push_worker() returns void language plpgsql security definer set search_path='' as $$
declare cfg private.push_settings%rowtype; token text;
begin
 select * into cfg from private.push_settings where singleton and enabled;
 if cfg.singleton is null or not exists(select 1 from private.push_jobs where (state='QUEUED' and next_attempt_at<=now()) or (state='SENDING' and lease_until<now())) then return; end if;
 select decrypted_secret into token from vault.decrypted_secrets where id=cfg.worker_token_secret;
 perform net.http_post(url:=cfg.worker_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=60000);
end $$;
revoke all on function private.wake_push_worker() from public,anon,authenticated;
create function private.wake_push_on_insert() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Wake failure must never roll back a user's report; minute scheduler retries.
 begin perform private.wake_push_worker(); exception when others then null; end;
 return null;
end $$;
revoke all on function private.wake_push_on_insert() from public,anon,authenticated;
create trigger dorni_wake_push after insert on private.push_jobs for each statement execute function private.wake_push_on_insert();

create function private.push_worker_config() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('public_key',s.public_key,'private_key',(select decrypted_secret from vault.decrypted_secrets where id=s.private_key_secret),'worker_token',(select decrypted_secret from vault.decrypted_secrets where id=s.worker_token_secret)) from private.push_settings s where s.singleton and s.enabled
$$;
create function private.claim_push_jobs(p_limit integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update private.push_jobs j set state='CANCELLED' where j.state in ('QUEUED','SENDING') and (j.created_at<now()-interval '1 hour' or not exists(select 1 from private.push_subscriptions s join auth.sessions a on a.id=s.session_id and a.user_id=s.user_id where s.id=j.subscription_id and s.enabled and s.user_id=j.recipient_id and s.session_id=j.session_id) or (j.report_id is not null and not exists(select 1 from public.reports r where r.id=j.report_id and r.status='ACTIVE' and r.expires_at>now())));
 update private.push_jobs set state='FAILED' where state='SENDING' and lease_until<now() and attempts>=5;
 with picked as (select id from private.push_jobs where ((state='QUEUED' and next_attempt_at<=now()) or (state='SENDING' and lease_until<now())) and attempts<5 order by created_at for update skip locked limit greatest(1,least(p_limit,20))),
 claimed as (update private.push_jobs j set state='SENDING',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' from picked p where j.id=p.id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease_token',j.lease_token,'report_id',j.report_id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth_key)),'[]'::jsonb) into result from claimed j join private.push_subscriptions s on s.id=j.subscription_id;
 return result;
end $$;
create function private.finish_push_job(p_id uuid,p_lease uuid,p_status integer) returns void language plpgsql security definer set search_path='' as $$
declare j private.push_jobs%rowtype;
begin
 select * into j from private.push_jobs where id=p_id and lease_token=p_lease and state='SENDING' for update;
 if j.id is null then return; end if;
 if p_status in (404,410) then update private.push_subscriptions set enabled=false,updated_at=now() where id=j.subscription_id and user_id=j.recipient_id and session_id=j.session_id; end if;
 update private.push_jobs set state=case when p_status between 200 and 299 then 'SENT' when (p_status=0 or p_status=429 or p_status>=500) and attempts<5 then 'QUEUED' else 'FAILED' end,
 last_status=p_status,next_attempt_at=now()+make_interval(secs=>least(900,30*power(2,attempts)::integer)),lease_until=null where id=p_id;
end $$;
revoke all on function private.push_worker_config(),private.claim_push_jobs(integer),private.finish_push_job(uuid,uuid,integer) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.push_worker_config(),private.claim_push_jobs(integer),private.finish_push_job(uuid,uuid,integer) to service_role;
create function public.push_worker_config() returns jsonb language sql security invoker set search_path='' as $$ select private.push_worker_config() $$;
create function public.claim_push_jobs(p_limit integer default 20) returns jsonb language sql security invoker set search_path='' as $$ select private.claim_push_jobs(p_limit) $$;
create function public.finish_push_job(p_id uuid,p_lease uuid,p_status integer) returns void language sql security invoker set search_path='' as $$ select private.finish_push_job(p_id,p_lease,p_status) $$;
revoke all on function public.push_worker_config(),public.claim_push_jobs(integer),public.finish_push_job(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.push_worker_config(),public.claim_push_jobs(integer),public.finish_push_job(uuid,uuid,integer) to service_role;
-- Only this Dorni worker is scheduled. No external accounts/projects are modified.
select cron.schedule('dorni-web-push-retry','* * * * *','select private.wake_push_worker()');
