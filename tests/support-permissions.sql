-- Fixtures live in a subtransaction and are ALWAYS rolled back, including on success.
do $test$
#variable_conflict use_variable
declare admin_id uuid:=gen_random_uuid(); staff_id uuid:=gen_random_uuid(); owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
 admin_session uuid:=gen_random_uuid(); staff_session uuid:=gen_random_uuid(); owner_session uuid:=gen_random_uuid();
 ticket_id uuid:=gen_random_uuid(); other_ticket uuid:=gen_random_uuid(); nonce uuid:=gen_random_uuid();
 result jsonb; stamp timestamptz; n int; staff_email text:=gen_random_uuid()::text||'@support-test.invalid';
begin
 begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
   (admin_id,admin_id::text||'@support-test.invalid',now(),'{"full_name":"QA Admin"}'),
   (staff_id,staff_email,now(),'{"full_name":"QA Staff"}'),
   (owner_id,owner_id::text||'@support-test.invalid',now(),'{"full_name":"QA Owner"}'),
   (other_id,other_id::text||'@support-test.invalid',now(),'{"full_name":"QA Other"}');
  insert into auth.sessions(id,user_id,created_at) values(admin_session,admin_id,now()),(staff_session,staff_id,now()),(owner_session,owner_id,now());
  insert into public.internal_memberships(user_id,role_code) values(admin_id,'SUPER_ADMIN');
  insert into public.support_tickets(id,requester_id,category,subject,description,assigned_to) values
   (ticket_id,owner_id,'GENERAL','QA ticket','QA description',staff_id),(other_ticket,other_id,'GENERAL','QA other ticket','QA other description',null);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'session_id',admin_session,'role','authenticated')::text,true);
  perform public.support_staff_admin('save',jsonb_build_object('email',staff_email,'active',true,'permissions',array['view','reply']));
  if jsonb_array_length(public.support_staff_admin('list'))<1 then raise exception 'FAIL staff list'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'session_id',staff_session,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  if private.is_internal() then raise exception 'FAIL support inherits internal'; end if;
  if public.get_my_account_context()->>'destination'<>'/support' then raise exception 'FAIL login destination'; end if;
  result:=public.support_workspace('list');
  if (result->>'total')::int<>1 then raise exception 'FAIL assigned scope'; end if;
  select count(*) into n from public.support_tickets;
  if n<>1 then raise exception 'FAIL RLS assigned scope'; end if;
  select count(*) into n from public.profiles where id=owner_id;
  if n<>0 then raise exception 'FAIL broad customer access'; end if;
  begin perform public.support_workspace('thread',jsonb_build_object('id',other_ticket)); raise exception 'FAIL other ticket access'; exception when insufficient_privilege then null; end;
  begin perform public.support_staff_admin('list'); raise exception 'FAIL admin staff access'; exception when insufficient_privilege then null; end;
  begin perform public.get_admin_overview(); raise exception 'FAIL admin overview'; exception when insufficient_privilege then null; end;
  begin perform public.owner_workspace('staff_tickets'); raise exception 'FAIL legacy list bypass'; exception when insufficient_privilege then null; end;
  begin perform public.owner_workspace('staff_reply',jsonb_build_object('id',ticket_id,'body','bypass')); raise exception 'FAIL legacy reply bypass'; exception when insufficient_privilege then null; end;
  begin perform public.support_workspace('status',jsonb_build_object('id',ticket_id,'status','CLOSED')); raise exception 'FAIL status denied'; exception when insufficient_privilege then null; end;
  begin perform public.support_workspace('assign',jsonb_build_object('id',ticket_id,'assignee',staff_id)); raise exception 'FAIL assign denied'; exception when insufficient_privilege then null; end;
  begin perform public.support_workspace('reply',jsonb_build_object('id',ticket_id,'body','secret','internal',true,'requestId',nonce)); raise exception 'FAIL note denied'; exception when insufficient_privilege then null; end;
  perform public.support_workspace('reply',jsonb_build_object('id',ticket_id,'body','Hello customer','internal',false,'requestId',nonce));
  perform public.support_workspace('reply',jsonb_build_object('id',ticket_id,'body','Hello customer','internal',false,'requestId',nonce));
  select count(*) into n from public.support_messages m where m.ticket_id=ticket_id and m.client_request_id=nonce;
  if n<>1 then raise exception 'FAIL duplicate reply'; end if;
  perform set_config('role','none',true);
  insert into public.support_messages(ticket_id,author_id,body,is_internal) values(ticket_id,admin_id,'Internal test note',true);
  perform set_config('role','authenticated',true);
  result:=public.support_workspace('thread',jsonb_build_object('id',ticket_id));
  if jsonb_array_length(result->'messages')<>1 then raise exception 'FAIL internal note leakage'; end if;
  select count(*) into n from public.support_messages where is_internal;
  if n<>0 then raise exception 'FAIL RLS internal note leakage'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'session_id',owner_session,'role','authenticated')::text,true);
  result:=public.owner_workspace('messages',jsonb_build_object('id',ticket_id));
  if jsonb_array_length(result)<>1 then raise exception 'FAIL customer sees private note'; end if;
  begin perform public.support_workspace('list'); raise exception 'FAIL owner staff access'; exception when insufficient_privilege then null; end;
  begin perform public.get_admin_overview(); raise exception 'FAIL NULL admin bypass'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'session_id',admin_session,'role','authenticated')::text,true);
  perform public.support_staff_admin('save',jsonb_build_object('id',staff_id,'active',true,'permissions',array['view','view_all','notes','status','assign']));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'session_id',staff_session,'role','authenticated')::text,true);
  if not private.support_allowed('view',other_ticket) then raise exception 'FAIL view_all'; end if;
  result:=public.support_workspace('thread',jsonb_build_object('id',ticket_id));
  if jsonb_array_length(result->'messages')<>2 then raise exception 'FAIL note capability'; end if;
  begin perform public.support_workspace('reply',jsonb_build_object('id',ticket_id,'body','No reply permission','internal',false,'requestId',gen_random_uuid())); raise exception 'FAIL revoked reply'; exception when insufficient_privilege then null; end;
  perform public.support_workspace('reply',jsonb_build_object('id',ticket_id,'body','Team only','internal',true,'requestId',gen_random_uuid()));
  result:=public.support_workspace('thread',jsonb_build_object('id',ticket_id)); stamp:=(result->'ticket'->>'updated_at')::timestamptz;
  perform public.support_workspace('status',jsonb_build_object('id',ticket_id,'status','RESOLVED','updatedAt',stamp));
  begin perform public.support_workspace('reply',jsonb_build_object('id',ticket_id,'body','Closed','internal',true,'requestId',gen_random_uuid())); raise exception 'FAIL closed reply'; exception when raise_exception then if sqlerrm<>'TICKET_CLOSED' then raise; end if; end;
  begin perform public.support_workspace('status',jsonb_build_object('id',ticket_id,'status','OPEN','updatedAt','2000-01-01T00:00:00Z')); raise exception 'FAIL stale edit'; exception when raise_exception then if sqlerrm<>'CONFLICT' then raise; end if; end;
  result:=public.support_workspace('thread',jsonb_build_object('id',ticket_id));
  perform public.support_workspace('status',jsonb_build_object('id',ticket_id,'status','OPEN','updatedAt',result->'ticket'->>'updated_at'));
  result:=public.support_workspace('thread',jsonb_build_object('id',other_ticket));
  perform public.support_workspace('assign',jsonb_build_object('id',other_ticket,'assignee',staff_id,'updatedAt',result->'ticket'->>'updated_at'));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'session_id',admin_session,'role','authenticated')::text,true);
  perform public.support_staff_admin('save',jsonb_build_object('id',staff_id,'active',false,'permissions',array['view']));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'session_id',staff_session,'role','authenticated')::text,true);
  begin perform public.support_workspace('list'); raise exception 'FAIL disabled access'; exception when insufficient_privilege then null; end;
  select count(*) into n from public.support_tickets;
  if n<>0 then raise exception 'FAIL revoked RLS'; end if;
  perform set_config('role','none',true);
  if exists(select 1 from public.support_tickets where assigned_to=staff_id and status='OPEN') then raise exception 'FAIL disabled staff assignment'; end if;
  -- Expired sessions are rejected even with a still-present JWT.
  update public.internal_memberships set active=true where user_id=staff_id;
  update auth.sessions set not_after=now()-interval '1 minute' where id=staff_session;
  if private.support_allowed('view') then raise exception 'FAIL expired session'; end if;
  raise exception 'All support authorization assertions passed' using errcode='PT001';
 exception when sqlstate 'PT001' then null;
 end;
end $test$;
