-- Integration checks in one rolled-back transaction. No account or notification is persisted.
begin;
do $$
declare u uuid; s uuid; ep text := 'https://fcm.googleapis.com/fcm/send/dorni-test-'||gen_random_uuid(); result jsonb; j jsonb; other_lease uuid:=gen_random_uuid();
begin
 select id into u from public.profiles limit 1;
 if u is null then raise exception 'TEST_REQUIRES_EXISTING_PROFILE'; end if;
 -- A transaction-local synthetic session, rolled back with all other fixtures.
 s:=gen_random_uuid();
 insert into auth.sessions(id,user_id) values(s,u);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',s,'role','authenticated')::text,true);
 perform public.push_device('subscribe',ep,repeat('A',87),repeat('B',22));
 result:=public.push_device('status',ep);
 if not (result->>'active')::boolean then raise exception 'SUBSCRIBE_FAILED'; end if;
 -- Exercise the real report-notification trigger without a real report or committed alert.
 insert into public.notification_messages(recipient_id,channel,template_code) values(u,'IN_APP','REPORT_CREATED');
 if not exists(select 1 from private.push_jobs j join private.push_subscriptions d on d.id=j.subscription_id where d.endpoint=ep and j.message_id is not null) then raise exception 'REPORT_TRIGGER_FAILED'; end if;
 -- Remove only the transaction-local trigger fixture so test-rate checks remain independent.
 delete from private.push_jobs where subscription_id=(select id from private.push_subscriptions where endpoint=ep);
 perform public.push_device('test',ep);
 begin
   perform public.push_device('test',ep);
   raise exception 'TEST_RATE_LIMIT_MISSING';
 exception when others then if sqlerrm<>'TEST_RATE_LIMIT' then raise; end if; end;
 result:=public.claim_push_jobs(20);
 select value into j from jsonb_array_elements(result) where value->>'endpoint'=ep;
 if j is null then raise exception 'CLAIM_FAILED'; end if;
 perform public.finish_push_job((j->>'id')::uuid,other_lease,201);
 if not exists(select 1 from private.push_jobs where id=(j->>'id')::uuid and state='SENDING') then raise exception 'LEASE_FENCING_FAILED'; end if;
 perform public.finish_push_job((j->>'id')::uuid,(j->>'lease_token')::uuid,503);
 if not exists(select 1 from private.push_jobs where id=(j->>'id')::uuid and state='QUEUED' and next_attempt_at>now()) then raise exception 'RETRY_FAILED'; end if;
 update private.push_jobs set next_attempt_at=now() where id=(j->>'id')::uuid;
 result:=public.claim_push_jobs(20);
 select value into j from jsonb_array_elements(result) where value->>'endpoint'=ep;
 perform public.finish_push_job((j->>'id')::uuid,(j->>'lease_token')::uuid,410);
 if (public.push_device('status',ep)->>'active')::boolean then raise exception 'EXPIRED_ENDPOINT_NOT_DISABLED'; end if;
 perform public.push_device('subscribe',ep,repeat('A',87),repeat('B',22));
 perform public.push_device('logout');
 if (public.push_device('status',ep)->>'active')::boolean then raise exception 'LOGOUT_FAILED'; end if;
 perform set_config('request.jwt.claims','{}',true);
 begin
   perform public.push_device('status',ep);
   raise exception 'AUTH_CHECK_MISSING';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
