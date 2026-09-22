-- Hosted migration owner_workspace; CLI unavailable in this workspace.
alter table public.codes add column owner_paused boolean not null default false;
alter table public.support_tickets drop constraint support_tickets_status_check;
alter table public.support_tickets add constraint support_tickets_status_check check(status in ('OPEN','IN_PROGRESS','WAITING_FOR_USER','RESOLVED','CLOSED'));
create index if not exists support_messages_ticket_created on public.support_messages(ticket_id,created_at);
create index if not exists support_tickets_requester_created on public.support_tickets(requester_id,created_at desc);
-- Sensitive columns and direct ticket writes are only changed by validated operations below.
revoke update on public.profiles from authenticated;
revoke update,delete on public.vehicles from authenticated;
revoke insert,update,delete on public.support_tickets,public.support_messages from authenticated;

create function private.owner_workspace(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid; target uuid; vid uuid; cid uuid; rid uuid; tid uuid; result jsonb; staff boolean; state text; name text; details text;
begin
 if u is null or not exists(select 1 from auth.sessions where id=sid and user_id=u) then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select exists(select 1 from public.internal_memberships where user_id=u and active and role_code in ('SUPER_ADMIN','SUPPORT','OPERATIONS')) into staff;
 if p_action='overview' then
  return jsonb_build_object(
   'sessions',(select coalesce(jsonb_agg(jsonb_build_object('current',id=sid,'created_at',created_at,'last_refreshed_at',refreshed_at) order by created_at desc),'[]'::jsonb) from auth.sessions where user_id=u and (not_after is null or not_after>now())),
   'tickets',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) from (select id,category,subject,description,status,vehicle_id,code_id,report_id,created_at,updated_at from public.support_tickets where requester_id=u order by created_at desc limit 100) t),
   'vehicles',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'manufacturer',v.manufacturer,'model',v.model,'color',v.color,'year',v.year,'nickname',v.nickname,'archived_at',v.archived_at,'card',(select jsonb_build_object('id',c.id,'serial_number',c.serial_number,'activation_state',c.activation_state,'owner_paused',c.owner_paused) from public.code_assignments a join public.codes c on c.id=a.code_id where a.vehicle_id=v.id and a.ended_at is null)) order by v.created_at desc),'[]'::jsonb) from public.vehicles v where v.owner_id=u),
   'legal',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from (select distinct on(kind) id,kind,version,content_md,published_at from public.terms_versions where locale='ar' and kind in ('TERMS','PRIVACY') order by kind,published_at desc) d),
   'reports',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select r.id,r.report_type_code,r.created_at from public.reports r join public.vehicles v on v.id=r.vehicle_id where v.owner_id=u order by r.created_at desc limit 50) r),
   'staff',staff);
 elsif p_action='staff_tickets' then
  if not staff then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (select id,category,subject,description,status,created_at from public.support_tickets order by updated_at desc limit 100) t);
 elsif p_action='messages' then
  tid:=(p_data->>'id')::uuid;
  if not exists(select 1 from public.support_tickets where id=tid and (requester_id=u or staff)) then raise exception 'NOT_FOUND'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'created_at',m.created_at,'mine',m.author_id=u,'internal',m.is_internal) order by m.created_at),'[]'::jsonb) from public.support_messages m where ticket_id=tid and (not is_internal or staff));
 end if;
 perform 1 from public.profiles where id=u and account_status='ACTIVE' for update;
 if not found then raise exception 'ACCOUNT_INACTIVE' using errcode='42501'; end if;
 if p_action='profile' then
  name:=trim(coalesce(p_data->>'name',''));
  if length(name) not between 2 and 100 then raise exception 'INVALID_INPUT'; end if;
  update public.profiles set full_name=name where id=u;
  -- Existing login provisioning reads this display-only metadata. Keep the two in sync.
  update auth.users set raw_user_meta_data=jsonb_set(coalesce(raw_user_meta_data,'{}'::jsonb),'{full_name}',to_jsonb(name)) where id=u;
 elsif p_action in ('vehicle_edit','vehicle_archive','vehicle_restore') then
  vid:=(p_data->>'id')::uuid;
  perform 1 from public.vehicles where id=vid and owner_id=u for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_action='vehicle_edit' then
   if length(trim(coalesce(p_data->>'manufacturer',''))) not between 1 and 80 or length(trim(coalesce(p_data->>'model',''))) not between 1 and 80 or length(trim(coalesce(p_data->>'color',''))) not between 1 and 40 or length(coalesce(p_data->>'nickname',''))>80 then raise exception 'INVALID_INPUT'; end if;
   update public.vehicles set manufacturer=trim(p_data->>'manufacturer'),model=trim(p_data->>'model'),color=trim(p_data->>'color'),nickname=nullif(trim(p_data->>'nickname'),''),year=nullif(p_data->>'year','')::smallint where id=vid;
  elsif p_action='vehicle_archive' then
   if exists(select 1 from public.code_assignments where vehicle_id=vid and ended_at is null) then raise exception 'CARD_ASSIGNED'; end if;
   update public.vehicles set archived_at=now() where id=vid;
  else update public.vehicles set archived_at=null where id=vid; end if;
 elsif p_action in ('card_suspend','card_resume','card_move','card_retire') then
  cid:=(p_data->>'id')::uuid;
  select c.activation_state into state from public.codes c join public.code_assignments a on a.code_id=c.id and a.ended_at is null join public.vehicles v on v.id=a.vehicle_id where c.id=cid and v.owner_id=u for update of c,a;
  if state is null then raise exception 'NOT_FOUND'; end if;
  if p_action='card_suspend' then
   if state<>'ACTIVE' then raise exception 'INVALID_STATE'; end if;
   update public.codes set activation_state='SUSPENDED',owner_paused=true where id=cid;
  elsif p_action='card_resume' then
   if state<>'SUSPENDED' or not exists(select 1 from public.codes where id=cid and owner_paused) then raise exception 'INVALID_STATE'; end if;
   update public.codes set activation_state='ACTIVE',owner_paused=false where id=cid;
  elsif p_action='card_retire' then
   if coalesce(p_data->>'confirm','')<>'RETIRE' then raise exception 'CONFIRM_REQUIRED'; end if;
   update public.codes set activation_state='REVOKED',owner_paused=false,revoked_at=now() where id=cid;
   update public.code_assignments set ended_at=now(),end_reason='OWNER_RETIRED' where code_id=cid and ended_at is null;
  else
   vid:=(p_data->>'vehicleId')::uuid;
   if state not in ('ACTIVE','SUSPENDED') then raise exception 'INVALID_STATE'; end if;
   perform 1 from public.vehicles where id=vid and owner_id=u and archived_at is null for update;
   if not found then raise exception 'NOT_FOUND'; end if;
   if exists(select 1 from public.code_assignments where vehicle_id=vid and ended_at is null) then raise exception 'CARD_ASSIGNED'; end if;
   update public.code_assignments set ended_at=now(),end_reason='MOVED' where code_id=cid and ended_at is null;
   insert into public.code_assignments(code_id,vehicle_id,assigned_by) values(cid,vid,u);
  end if;
 elsif p_action='ticket_create' then
  name:=trim(coalesce(p_data->>'subject','')); details:=trim(coalesce(p_data->>'description',''));
  if length(name) not between 3 and 160 or length(details) not between 5 and 4000 or coalesce(p_data->>'category','') not in ('GENERAL','ACCOUNT','PHONE_NUMBER','VEHICLE','QR_OR_NFC','CODE_ACTIVATION','NOTIFICATIONS','TECHNICAL_PROBLEM','BILLING_OR_SUBSCRIPTION','OTHER','DELETION_REQUEST') then raise exception 'INVALID_INPUT'; end if;
  if (select count(*) from public.support_tickets where requester_id=u and created_at>now()-interval '1 day')>=10 then raise exception 'TICKET_LIMIT'; end if;
  vid:=nullif(p_data->>'vehicleId','')::uuid; cid:=nullif(p_data->>'codeId','')::uuid; rid:=nullif(p_data->>'reportId','')::uuid;
  if vid is not null and not exists(select 1 from public.vehicles where id=vid and owner_id=u) then raise exception 'NOT_FOUND'; end if;
  if cid is not null and not exists(select 1 from public.code_assignments a join public.vehicles v on v.id=a.vehicle_id where a.code_id=cid and v.owner_id=u and a.ended_at is null) then raise exception 'NOT_FOUND'; end if;
  if rid is not null and not exists(select 1 from public.reports r join public.vehicles v on v.id=r.vehicle_id where r.id=rid and v.owner_id=u) then raise exception 'NOT_FOUND'; end if;
  if p_data->>'category'='DELETION_REQUEST' then
   if coalesce(p_data->>'confirm','')<>'REQUEST_DELETE' then raise exception 'CONFIRM_REQUIRED'; end if;
   select id into tid from public.support_tickets where requester_id=u and category='DELETION_REQUEST' and status not in ('CLOSED','RESOLVED') limit 1;
   if tid is not null then return jsonb_build_object('ok',true,'id',tid); end if;
  end if;
  insert into public.support_tickets(requester_id,category,subject,description,vehicle_id,code_id,report_id) values(u,p_data->>'category',name,details,vid,cid,rid) returning id into tid;
 elsif p_action in ('ticket_reply','staff_reply') then
  tid:=(p_data->>'id')::uuid; details:=trim(coalesce(p_data->>'body',''));
  if length(details) not between 1 and 4000 then raise exception 'INVALID_INPUT'; end if;
  select status into state from public.support_tickets where id=tid and (requester_id=u or (staff and p_action='staff_reply')) for update;
  if state is null then raise exception 'NOT_FOUND'; end if;
  if state in ('CLOSED','RESOLVED') then raise exception 'TICKET_CLOSED'; end if;
  if p_action='staff_reply' and not staff then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  insert into public.support_messages(ticket_id,author_id,body,is_internal) values(tid,u,details,p_action='staff_reply' and coalesce((p_data->>'internal')::boolean,false));
  state:=case when p_action='staff_reply' then coalesce(p_data->>'status','WAITING_FOR_USER') else 'OPEN' end;
  if state not in ('OPEN','IN_PROGRESS','WAITING_FOR_USER','RESOLVED','CLOSED') then raise exception 'INVALID_STATE'; end if;
  update public.support_tickets set status=state where id=tid;
 else raise exception 'INVALID_ACTION'; end if;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id) values(u,case when p_action='staff_reply' then 'ADMIN' else 'OWNER' end,upper(p_action),'owner_workspace',coalesce(tid,cid,vid,u));
 return jsonb_build_object('ok',true,'id',tid);
end $$;
revoke all on function private.owner_workspace(text,jsonb) from public,anon,authenticated;
grant execute on function private.owner_workspace(text,jsonb) to authenticated;
create function public.owner_workspace(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.owner_workspace(p_action,p_data) $$;
revoke all on function public.owner_workspace(text,jsonb) from public,anon;
grant execute on function public.owner_workspace(text,jsonb) to authenticated;

