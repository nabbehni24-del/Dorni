-- Staging hardening: do not send to expired sessions or inactive accounts.
CREATE OR REPLACE FUNCTION private.claim_push_jobs(p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  update private.push_jobs j set state='CANCELLED' where j.state in ('QUEUED','SENDING') and (
    j.created_at<now()-interval '1 hour'
    or not exists(select 1 from private.push_subscriptions s join auth.sessions a on a.id=s.session_id and a.user_id=s.user_id where s.id=j.subscription_id and s.enabled and s.user_id=j.recipient_id and s.session_id=j.session_id and (a.not_after is null or a.not_after>now()) and exists(select 1 from public.profiles p where p.id=s.user_id and p.account_status='ACTIVE'))
    or (j.report_id is not null and not exists(select 1 from public.reports r where r.id=j.report_id and r.status='ACTIVE' and r.expires_at>now()))
    or (j.institutional_action_id is not null and not exists(select 1 from public.institutional_actions a where a.id=j.institutional_action_id and a.status in ('SENT','DELIVERED','ACKNOWLEDGED') and a.expires_at>now()))
  );
  update private.push_jobs set state='FAILED' where state='SENDING' and lease_until<now() and attempts>=5;
  with picked as (select id from private.push_jobs where ((state='QUEUED' and next_attempt_at<=now()) or (state='SENDING' and lease_until<now())) and attempts<5 order by created_at for update skip locked limit greatest(1,least(p_limit,20))),
  claimed as (update private.push_jobs j set state='SENDING',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' from picked p where j.id=p.id returning j.*)
  select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease_token',j.lease_token,'report_id',j.report_id,'institutional_action_id',j.institutional_action_id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth_key)),'[]'::jsonb) into result from claimed j join private.push_subscriptions s on s.id=j.subscription_id;
  return result;
end $function$
;
CREATE OR REPLACE FUNCTION private.enqueue_report_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.channel='IN_APP' and new.template_code in ('REPORT_CREATED','INSTITUTIONAL_MOVE_REQUEST') then
    insert into private.push_jobs(subscription_id,recipient_id,session_id,message_id,report_id,institutional_action_id)
    select s.id,s.user_id,s.session_id,new.id,new.report_id,new.institutional_action_id from private.push_subscriptions s
    join auth.sessions a on a.id=s.session_id and a.user_id=s.user_id
    where s.user_id=new.recipient_id and s.enabled and (a.not_after is null or a.not_after>now()) and exists(select 1 from public.profiles p where p.id=s.user_id and p.account_status='ACTIVE');
  end if;
  return new;
end $function$
;
revoke all on function private.handle_updated_user() from public,anon,authenticated,service_role;
