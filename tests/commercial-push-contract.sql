-- LOCAL ONLY: table contracts from dorni_web_push.sql, no pg_net/cron/network workers.
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
