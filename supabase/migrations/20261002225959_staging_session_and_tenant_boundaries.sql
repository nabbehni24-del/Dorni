-- Staging security verification fixes; not approved for Production.
begin;
create or replace function private.live_account_session() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join public.profiles p on p.id=s.user_id
 where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>now()) and p.account_status='ACTIVE')
$$;
revoke all on function private.live_account_session() from public,anon,service_role;
grant execute on function private.live_account_session() to authenticated;
do $$declare t text;begin
 for t in select distinct tablename from pg_policies where schemaname='public' and 'authenticated'=any(roles) and tablename not in ('report_types','terms_versions','organization_permissions','institutional_action_types','institutional_action_reasons') loop
 execute format('create policy staging_live_session_guard on public.%I as restrictive for all to authenticated using ((select private.live_account_session())) with check ((select private.live_account_session()))',t);
 end loop;
end$$;
create policy staging_live_session_guard on storage.objects as restrictive for all to authenticated using ((select private.live_account_session())) with check ((select private.live_account_session()));

CREATE OR REPLACE FUNCTION private.owner_workspace(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=private.commercial_user(); sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid; target uuid; vid uuid; cid uuid; rid uuid; tid uuid; result jsonb; staff boolean; state text; name text; details text;
begin
 if u is null or not exists(select 1 from auth.sessions where id=sid and user_id=u) then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 staff:=false; if p_action in ('staff_tickets','staff_reply') then raise exception 'USE_SUPPORT_WORKSPACE' using errcode='42501'; end if;
 if p_action='overview' then
  return jsonb_build_object(
   'sessions',(select coalesce(jsonb_agg(jsonb_build_object('current',id=sid,'created_at',created_at,'last_refreshed_at',refreshed_at) order by created_at desc),'[]'::jsonb) from auth.sessions where user_id=u and (not_after is null or not_after>now())),
   'tickets',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) from (select id,category,subject,description,status,vehicle_id,code_id,report_id,created_at,updated_at from public.support_tickets where requester_id=u order by created_at desc limit 100) t),
   'vehicles',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'manufacturer',v.manufacturer,'model',v.model,'color',v.color,'year',v.year,'nickname',v.nickname,'archived_at',v.archived_at,'card',(select jsonb_build_object('id',c.id,'serial_number',c.serial_number,'activation_state',c.activation_state,'owner_paused',c.owner_paused) from public.code_assignments a join public.codes c on c.id=a.code_id where a.vehicle_id=v.id and a.ended_at is null)) order by v.created_at desc),'[]'::jsonb) from public.vehicles v where v.owner_id=u),
   'legal',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from (select distinct on(kind) id,kind,version,content_md,published_at from public.terms_versions where locale='ar' and kind in ('TERMS','PRIVACY') order by kind,published_at desc) d),
   'reports',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select r.id,r.report_type_code,r.created_at from public.reports r join public.vehicles v on v.id=r.vehicle_id where v.owner_id=u order by r.created_at desc limit 50) r),
   'staff',private.support_allowed('view'));
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
end $function$;

CREATE OR REPLACE FUNCTION private.push_device(p_action text, p_endpoint text DEFAULT NULL::text, p_p256dh text DEFAULT NULL::text, p_auth text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid := private.commercial_user(); s uuid := nullif(auth.jwt()->>'session_id','')::uuid; sub private.push_subscriptions%rowtype; cfg private.push_settings%rowtype;
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
end $function$;

CREATE OR REPLACE FUNCTION public.register_my_partner_organization(p_name text, p_type text, p_registration_number text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select private.commercial_user());
  v_confirmed timestamptz;
  v_org public.partner_organizations%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select email_confirmed_at into v_confirmed from auth.users where id=v_user;
  if v_confirmed is null then raise exception 'EMAIL_NOT_CONFIRMED' using errcode='42501'; end if;
  if p_type not in ('INSURANCE','CORPORATE','DISTRIBUTOR','OTHER') then raise exception 'INVALID_PARTNER_TYPE' using errcode='22023'; end if;
  if nullif(trim(p_name),'') is null or char_length(trim(p_name))>160 then raise exception 'INVALID_PARTNER_NAME' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('org-registration:'||v_user::text,0));
  select o.* into v_org
  from public.partner_memberships m
  join public.partner_organizations o on o.id=m.organization_id
  where m.user_id=v_user and m.status='ACTIVE'
  order by m.created_at
  limit 1;
  if v_org.id is not null then
    return jsonb_build_object('organization',to_jsonb(v_org),'created',false);
  end if;

  insert into public.partner_organizations(name,type,status,trusted_generation,registration_number,generation_limit_per_day)
  values(trim(p_name),p_type,'PENDING',false,nullif(trim(p_registration_number),''),100)
  returning * into v_org;
  insert into public.partner_memberships(organization_id,user_id,role,status)
  values(v_org.id,v_user,'PARTNER_ADMIN','ACTIVE');
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','PARTNER_APPLICATION_SUBMITTED','partner_organization',v_org.id,jsonb_build_object('type',p_type));
  return jsonb_build_object('organization',to_jsonb(v_org),'created',true);
exception when unique_violation then
  raise exception 'REGISTRATION_NUMBER_EXISTS' using errcode='23505';
end $function$;

CREATE OR REPLACE FUNCTION public.get_organization_institutional_overview(p_organization_id uuid, p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select private.commercial_user());
  v_can_actions boolean; v_can_members boolean; v_can_invite boolean;
  v_can_roles boolean; v_can_audit boolean; v_can_report boolean;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_from>=p_to or p_to-p_from>interval '366 days'
    then raise exception 'INVALID_PERIOD' using errcode='22023'; end if;
  v_can_actions:=private.has_org_permission(p_organization_id,'VEHICLE_MOVE_REQUEST',v_user);
  v_can_members:=private.has_org_permission(p_organization_id,'ORG_MEMBER_VIEW',v_user);
  v_can_invite:=private.has_org_permission(p_organization_id,'ORG_MEMBER_INVITE',v_user);
  v_can_roles:=private.has_org_permission(p_organization_id,'ORG_ROLE_ASSIGN',v_user);
  v_can_audit:=private.has_org_permission(p_organization_id,'ORG_AUDIT_VIEW',v_user);
  v_can_report:=private.has_org_permission(p_organization_id,'ORG_REPORT_VIEW',v_user);
  if not (v_can_actions or v_can_members or v_can_invite or v_can_roles or v_can_audit or v_can_report)
    then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return jsonb_build_object(
    'organization',(select jsonb_build_object(
      'id',o.id,'name',o.name,'status',o.status,'institutionalEnabled',o.institutional_enabled,
      'institutionalStatus',o.institutional_status
    ) from public.partner_organizations o where o.id=p_organization_id),
    'capabilities',jsonb_build_object(
      'actions',v_can_actions,'members',v_can_members,'invite',v_can_invite and v_can_roles,
      'roles',v_can_roles,'audit',v_can_audit,'reports',v_can_report
    ),
    'actions',case when v_can_actions or v_can_report then coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'referenceNumber',a.reference_number,'actionType',a.action_type,'reasonCode',a.reason_code,
      'status',a.status,'ownerResponse',a.owner_response,'createdAt',a.created_at,'deliveredAt',a.delivered_at,
      'acknowledgedAt',a.acknowledged_at,'completedAt',a.completed_at
    ) order by a.created_at desc) from public.institutional_actions a
      where a.organization_id=p_organization_id and a.created_at>=p_from and a.created_at<p_to),'[]'::jsonb) else '[]'::jsonb end,
    'metrics',case when v_can_report or v_can_actions then (select jsonb_build_object(
      'total',count(*),'sent',count(*) filter(where status='SENT'),'delivered',count(*) filter(where status='DELIVERED'),
      'acknowledged',count(*) filter(where acknowledged_at is not null),'completed',count(*) filter(where status='COMPLETED'),
      'unacknowledged',count(*) filter(where acknowledged_at is null and status in ('SENT','DELIVERED'))
    ) from public.institutional_actions where organization_id=p_organization_id and created_at>=p_from and created_at<p_to) else '{}'::jsonb end,
    'members',case when v_can_members then coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'name',p.full_name,'email',p.email,'status',m.status,'roleId',m.role_id,'roleName',r.name_ar,
      'lastActivity',(select max(a.created_at) from public.institutional_actions a where a.membership_id=m.id),
      'actionCount',(select count(*) from public.institutional_actions a where a.membership_id=m.id and a.created_at>=p_from and a.created_at<p_to)
    ) order by m.created_at) from public.partner_memberships m join public.profiles p on p.id=m.user_id
      left join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id
      where m.organization_id=p_organization_id),'[]'::jsonb) else '[]'::jsonb end,
    'roles',case when v_can_roles or v_can_invite then coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'code',r.code,'name',r.name_ar,'systemRole',r.system_role,
      'permissions',coalesce((select jsonb_agg(rp.permission_code order by rp.permission_code) from public.organization_role_permissions rp where rp.role_id=r.id),'[]'::jsonb)
    ) order by r.created_at) from public.organization_roles r where r.organization_id=p_organization_id and r.active),'[]'::jsonb) else '[]'::jsonb end,
    'entitlements',case when v_can_roles then coalesce((select jsonb_agg(e.permission_code order by e.permission_code)
      from public.organization_entitlements e where e.organization_id=p_organization_id and e.revoked_at is null),'[]'::jsonb) else '[]'::jsonb end,
    'invitations',case when v_can_invite then coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'roleId',i.role_id,'roleName',r.name_ar,'createdAt',i.created_at,'expiresAt',i.expires_at,
      'status',case when i.claimed_at is not null then 'CLAIMED' when i.revoked_at is not null then 'REVOKED' when i.expires_at<=now() then 'EXPIRED' else 'PENDING' end
    ) order by i.created_at desc) from public.partner_invitations i
      left join public.organization_roles r on r.id=i.role_id and r.organization_id=i.organization_id
      where i.organization_id=p_organization_id and i.created_at>=p_from),'[]'::jsonb) else '[]'::jsonb end,
    'audit',case when v_can_audit then coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'action',l.action,'entityType',l.entity_type,'entityId',l.entity_id,'createdAt',l.created_at
    ) order by l.created_at desc) from (select * from public.audit_logs
      where safe_metadata->>'organizationId'=p_organization_id::text and created_at>=p_from and created_at<p_to
      order by created_at desc limit 100) l),'[]'::jsonb) else '[]'::jsonb end
  );
end $function$;

CREATE OR REPLACE FUNCTION public.get_enterprise_console(p_organization_id uuid, p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=(select private.commercial_user()); v_admin boolean; v_manage_structure boolean; v_manage_operations boolean; v_manage_scope boolean; v_manage_policy boolean; v_manage_inventory boolean; v_view_reports boolean; v_view_members boolean; v_result jsonb;
begin
 if not private.is_active_org_member(p_organization_id,v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_from>=p_to or p_to-p_from>interval '366 days' then raise exception 'INVALID_PERIOD' using errcode='22023'; end if;
 v_admin:=private.is_org_admin(p_organization_id,v_user);
 v_manage_structure:=v_admin or private.has_org_permission(p_organization_id,'ORG_STRUCTURE_MANAGE',v_user);
 v_manage_operations:=v_admin or private.has_org_permission(p_organization_id,'ORG_OPERATION_MANAGE',v_user);
 v_manage_scope:=v_admin or private.has_org_permission(p_organization_id,'ORG_SCOPE_ASSIGN',v_user);
 v_manage_policy:=v_admin or private.has_org_permission(p_organization_id,'ORG_POLICY_MANAGE',v_user);
 v_manage_inventory:=v_admin or private.has_org_permission(p_organization_id,'ORG_INVENTORY_MANAGE',v_user);
 v_view_reports:=v_manage_operations or private.has_org_permission(p_organization_id,'ORG_REPORT_VIEW',v_user);
 v_view_members:=v_manage_scope or v_manage_operations or private.has_org_permission(p_organization_id,'ORG_MEMBER_VIEW',v_user);
 v_result:=jsonb_build_object(
  'capabilities',jsonb_build_object('structure',v_manage_structure,'operations',v_manage_operations,'scopes',v_manage_scope,'policy',v_manage_policy,'inventory',v_manage_inventory,'admin',v_admin),
  'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'type',s.site_type,'address',s.address_text,'status',s.status,'primary',s.is_primary,'memberCount',(select count(*) from public.organization_member_scopes ms where ms.site_id=s.id and ms.ended_at is null),'openCases',(select count(*) from public.institutional_actions a where a.site_id=s.id and a.status not in ('COMPLETED','CANCELLED','EXPIRED'))) order by s.is_primary desc,s.name) from public.organization_sites s where s.organization_id=p_organization_id),'[]'::jsonb),
  'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'siteId',u.site_id,'parentId',u.parent_unit_id,'code',u.code,'name',u.name,'type',u.unit_type,'costCenter',u.cost_center,'status',u.status,'memberCount',(select count(*) from public.organization_member_scopes ms where ms.unit_id=u.id and ms.ended_at is null),'openCases',(select count(*) from public.institutional_actions a where a.unit_id=u.id and a.status not in ('COMPLETED','CANCELLED','EXPIRED'))) order by u.name) from public.organization_units u where u.organization_id=p_organization_id),'[]'::jsonb),
  'scopes',coalesce((select jsonb_agg(jsonb_build_object('id',ms.id,'membershipId',ms.membership_id,'siteId',ms.site_id,'unitId',ms.unit_id,'role',ms.scope_role,'primary',ms.is_primary) order by ms.assigned_at) from public.organization_member_scopes ms where ms.organization_id=p_organization_id and ms.ended_at is null),'[]'::jsonb),
  'policies',coalesce((select jsonb_agg(jsonb_build_object('priority',p.priority,'acknowledgementMinutes',p.acknowledgement_minutes,'resolutionMinutes',p.resolution_minutes,'escalationMinutes',p.escalation_minutes) order by array_position(array['CRITICAL','HIGH','NORMAL','LOW'],p.priority)) from public.organization_sla_policies p where p.organization_id=p_organization_id),'[]'::jsonb),
  'operations',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'referenceNumber',a.reference_number,'status',a.status,'priority',a.priority,'reasonCode',a.reason_code,'siteId',a.site_id,'unitId',a.unit_id,'assignedMembershipId',a.assigned_membership_id,'assigneeName',pp.full_name,'createdAt',a.created_at,'updatedAt',a.updated_at,'slaDueAt',a.sla_due_at,'overdue',(a.status not in ('COMPLETED','CANCELLED','EXPIRED') and a.sla_due_at<now()),'note',a.operational_note) order by (a.status not in ('COMPLETED','CANCELLED','EXPIRED') and a.sla_due_at<now()) desc,array_position(array['CRITICAL','HIGH','NORMAL','LOW'],a.priority),a.created_at desc) from public.institutional_actions a left join public.partner_memberships pm on pm.id=a.assigned_membership_id left join public.profiles pp on pp.id=pm.user_id where a.organization_id=p_organization_id and a.created_at>=p_from and a.created_at<p_to),'[]'::jsonb),
  'metrics',(select jsonb_build_object('total',count(*),'open',count(*) filter(where status not in ('COMPLETED','CANCELLED','EXPIRED')),'overdue',count(*) filter(where status not in ('COMPLETED','CANCELLED','EXPIRED') and sla_due_at<now()),'critical',count(*) filter(where priority='CRITICAL' and status not in ('COMPLETED','CANCELLED','EXPIRED')),'unassigned',count(*) filter(where assigned_membership_id is null and status not in ('COMPLETED','CANCELLED','EXPIRED')),'slaCompliance',case when count(*) filter(where status='COMPLETED')=0 then 100 else round(100.0*count(*) filter(where status='COMPLETED' and completed_at<=sla_due_at)/count(*) filter(where status='COMPLETED'),1) end) from public.institutional_actions where organization_id=p_organization_id and created_at>=p_from and created_at<p_to),
  'workforce',coalesce((select jsonb_agg(jsonb_build_object('membershipId',m.id,'name',coalesce(p.full_name,p.email),'status',m.status,'roleName',r.name_ar,'openCases',(select count(*) from public.institutional_actions a where a.assigned_membership_id=m.id and a.status not in ('COMPLETED','CANCELLED','EXPIRED')),'overdueCases',(select count(*) from public.institutional_actions a where a.assigned_membership_id=m.id and a.status not in ('COMPLETED','CANCELLED','EXPIRED') and a.sla_due_at<now())) order by p.full_name,p.email) from public.partner_memberships m join public.profiles p on p.id=m.user_id left join public.organization_roles r on r.id=m.role_id and r.organization_id=m.organization_id where m.organization_id=p_organization_id),'[]'::jsonb),
  'inventory',coalesce((select jsonb_agg(jsonb_build_object('batchId',b.id,'batchCode',b.batch_code,'quantity',b.quantity,'generated',b.generated_count,'allocated',coalesce((select sum(x.quantity) from public.organization_inventory_allocations x where x.batch_id=b.id and x.status='ALLOCATED'),0),'claimed',(select count(*) from public.codes c where c.batch_id=b.id and c.ownership_state='CLAIMED')) order by b.created_at desc) from public.code_batches b where b.organization_id=p_organization_id),'[]'::jsonb)
 );
 if not (v_manage_structure or v_manage_scope or v_manage_operations or v_manage_inventory) then v_result:=v_result||'{"sites":[],"units":[]}'::jsonb;end if;
 if not v_manage_scope then v_result:=v_result||'{"scopes":[]}'::jsonb;end if;
 if not v_manage_policy then v_result:=v_result||'{"policies":[]}'::jsonb;end if;
 if not v_view_reports then v_result:=v_result||'{"operations":[],"metrics":{}}'::jsonb;end if;
 if not v_view_members then v_result:=v_result||'{"workforce":[]}'::jsonb;end if;
 if not v_manage_inventory then v_result:=v_result||'{"inventory":[]}'::jsonb;end if;
 return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.org_upsert_role(p_organization_id uuid, p_role_id uuid, p_code text, p_name_ar text, p_permissions text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_role public.organization_roles%rowtype; v_permission text;
begin
  perform 1 from public.partner_organizations where id=p_organization_id for update;
  if not private.has_org_permission(p_organization_id,'ORG_ROLE_ASSIGN',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_code is null or p_name_ar is null or p_permissions is null or p_code in ('PARTNER_ADMIN','PARTNER_OPERATOR','PARTNER_VIEWER') then raise exception 'INVALID_ROLE' using errcode='22023'; end if;
  if p_code !~ '^[A-Z][A-Z0-9_]{2,60}$' or char_length(trim(p_name_ar)) not between 2 and 100 then raise exception 'INVALID_ROLE' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_permissions) x where not exists(select 1 from public.organization_entitlements e where e.organization_id=p_organization_id and e.permission_code=x and e.revoked_at is null)) then raise exception 'PERMISSION_NOT_ENTITLED' using errcode='42501'; end if;
  if p_role_id is null then
    insert into public.organization_roles(organization_id,code,name_ar,created_by) values(p_organization_id,p_code,trim(p_name_ar),v_user) returning * into v_role;
  else
    update public.organization_roles set code=p_code,name_ar=trim(p_name_ar),updated_at=now() where id=p_role_id and organization_id=p_organization_id and not system_role returning * into v_role;
    if v_role.id is null then raise exception 'ROLE_NOT_EDITABLE' using errcode='42501'; end if;
  end if;
  delete from public.organization_role_permissions where role_id=v_role.id;
  foreach v_permission in array p_permissions loop
    insert into public.organization_role_permissions(role_id,permission_code,assigned_by) values(v_role.id,v_permission,v_user);
  end loop;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','ORGANIZATION_ROLE_UPSERTED','organization_role',v_role.id,jsonb_build_object('organizationId',p_organization_id,'permissions',p_permissions));
  return jsonb_build_object('id',v_role.id,'code',v_role.code,'name',v_role.name_ar,'permissions',p_permissions);
end $function$;

CREATE OR REPLACE FUNCTION public.create_institutional_move_request(p_organization_id uuid, p_public_token text, p_reason_code text, p_reason_note text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select private.commercial_user());
  v_membership public.partner_memberships%rowtype;
  v_code uuid; v_assignment uuid; v_vehicle uuid; v_owner uuid;
  v_reason public.institutional_action_reasons%rowtype;
  v_action public.institutional_actions%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  perform 1 from public.partner_organizations where id=p_organization_id for update;
  if not private.has_org_permission(p_organization_id,'VEHICLE_MOVE_REQUEST',v_user) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into v_membership from public.partner_memberships
    where organization_id=p_organization_id and user_id=v_user and status='ACTIVE' for share;
  select * into v_reason from public.institutional_action_reasons
    where code=p_reason_code and action_type='VEHICLE_MOVE_REQUEST' and active;
  if v_reason.code is null then raise exception 'INVALID_REASON' using errcode='22023'; end if;
  if v_reason.requires_note and (nullif(trim(p_reason_note),'') is null or char_length(trim(p_reason_note)) not between 3 and 240)
    then raise exception 'REASON_NOTE_REQUIRED' using errcode='22023'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 120 then raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode='22023'; end if;
  select c.id,a.id,a.vehicle_id,v.owner_id into v_code,v_assignment,v_vehicle,v_owner
  from public.codes c
  join public.code_assignments a on a.code_id=c.id and a.ended_at is null
  join public.vehicles v on v.id=a.vehicle_id and v.archived_at is null
  where c.public_token=p_public_token and private.code_service_available(c.id) for share;
  if v_code is null then raise exception 'CODE_NOT_ACTIVE' using errcode='P0002'; end if;
  select * into v_action from public.institutional_actions
    where membership_id=v_membership.id and idempotency_key=p_idempotency_key;
  if v_action.id is not null then
    if v_action.code_id is distinct from v_code or v_action.reason_code is distinct from p_reason_code or v_action.reason_note is distinct from nullif(trim(coalesce(p_reason_note,'')),'') then raise exception 'REQUEST_CONFLICT' using errcode='22023';end if;
    return jsonb_build_object('id',v_action.id,'referenceNumber',v_action.reference_number,'status',v_action.status,'created',false);
  end if;
  if (select count(*) from public.institutional_actions where membership_id=v_membership.id and created_at>now()-interval '10 minutes')>=10
    then raise exception 'RATE_LIMITED' using errcode='P0001'; end if;
  if exists(select 1 from public.institutional_actions where organization_id=p_organization_id and code_assignment_id=v_assignment
    and action_type='VEHICLE_MOVE_REQUEST' and status in ('SENT','DELIVERED','ACKNOWLEDGED') and created_at>now()-interval '2 minutes')
    then raise exception 'DUPLICATE_ACTIVE_REQUEST' using errcode='P0001'; end if;
  insert into public.institutional_actions(
    reference_number,organization_id,membership_id,actor_id,code_id,code_assignment_id,vehicle_id,
    action_type,reason_code,reason_note,status,idempotency_key
  ) values(
    'DOR-MOVE-'||to_char(now(),'YYMMDD')||'-'||lpad(nextval('public.dorni_institutional_reference')::text,6,'0'),
    p_organization_id,v_membership.id,v_user,v_code,v_assignment,v_vehicle,'VEHICLE_MOVE_REQUEST',v_reason.code,
    nullif(trim(coalesce(p_reason_note,'')),''),'SENT',p_idempotency_key
  ) returning * into v_action;
  insert into public.institutional_action_events(action_id,event_type,actor_id,actor_kind,to_status,safe_metadata)
  values(v_action.id,'ACTION_CREATED',v_user,'ORGANIZATION_MEMBER','SENT',jsonb_build_object('reasonCode',v_reason.code,'correlationId',v_action.correlation_id));
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','INSTITUTIONAL_MOVE_REQUEST_CREATED','institutional_action',v_action.id,
    jsonb_build_object('organizationId',p_organization_id,'membershipId',v_membership.id,'codeAssignmentId',v_assignment,'reasonCode',v_reason.code,'correlationId',v_action.correlation_id));
  insert into public.notification_messages(institutional_action_id,recipient_id,channel,template_code)
  values(v_action.id,v_owner,'IN_APP','INSTITUTIONAL_MOVE_REQUEST');
  insert into public.notification_messages(institutional_action_id,recipient_id,channel,template_code)
  select v_action.id,v_owner,n.primary_channel,'INSTITUTIONAL_MOVE_REQUEST'
  from public.notification_preferences n where n.user_id=v_owner and n.primary_channel<>'IN_APP';
  return jsonb_build_object('id',v_action.id,'referenceNumber',v_action.reference_number,'status',v_action.status,'created',true);
end $function$;

CREATE OR REPLACE FUNCTION public.claim_partner_invitation(p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid := (select private.commercial_user()); v_email text; v_inv public.partner_invitations%rowtype; v_org_name text; v_membership public.partner_memberships%rowtype; v_org uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select lower(email) into v_email from auth.users where id=v_user and email_confirmed_at is not null;
  if v_email is null then raise exception 'EMAIL_NOT_CONFIRMED' using errcode='42501'; end if;
  select organization_id into v_org from public.partner_invitations where token_hash=p_token_hash;
  perform 1 from public.partner_organizations where id=v_org for update;
  select * into v_inv from public.partner_invitations
    where token_hash=p_token_hash and claimed_at is null and revoked_at is null and expires_at>now() for update;
  if v_inv.id is null then raise exception 'INVITATION_INVALID' using errcode='P0002'; end if;
  if lower(v_inv.email) is distinct from v_email then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='42501'; end if;
  if not exists(select 1 from public.partner_organizations where id=v_inv.organization_id and status='ACTIVE' and institutional_status='VERIFIED')
    then raise exception 'ORGANIZATION_NOT_ACTIVE' using errcode='42501'; end if;
  if not exists(select 1 from public.organization_roles where id=v_inv.role_id and organization_id=v_inv.organization_id and active) then raise exception 'INVALID_ROLE' using errcode='42501';end if;
  select * into v_membership from public.partner_memberships where organization_id=v_inv.organization_id and user_id=v_user for update;
  -- An old invitation must never undo an administrator's later role/status decision.
  if v_membership.id is not null then raise exception 'MEMBERSHIP_EXISTS' using errcode='42501';end if;
  insert into public.partner_memberships(organization_id,user_id,role,role_id,status)
  values(v_inv.organization_id,v_user,v_inv.role,v_inv.role_id,'ACTIVE')
  returning * into v_membership;
  update public.partner_invitations set claimed_by=v_user,claimed_at=now() where id=v_inv.id;
  select name into v_org_name from public.partner_organizations where id=v_inv.organization_id;
  insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
  values(v_user,'PARTNER','ORGANIZATION_MEMBER_ACTIVATED','partner_membership',v_membership.id,
    jsonb_build_object('organizationId',v_inv.organization_id,'invitationId',v_inv.id,'roleId',v_inv.role_id));
  return jsonb_build_object('organizationId',v_inv.organization_id,'organizationName',v_org_name,'membershipId',v_membership.id,'roleId',v_inv.role_id);
end $function$;

CREATE OR REPLACE FUNCTION private.report_support(p_hash text, p_action text DEFAULT 'status'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.reports; t public.support_tickets; c jsonb; allowed boolean; callable boolean; escalation_at timestamptz; call_at timestamptz;
begin
 if p_action not in ('status','escalate') then raise exception 'INVALID_INPUT'; end if;
 -- Lock serializes repeat escalation requests. No IDs supplied by the browser are trusted.
 select * into r from public.reports where expires_at>now() and (status_token_hash=p_hash or id=(select a.report_id from private.report_access_tokens a where a.token_hash=p_hash and a.expires_at>now()));
 if found and p_action='escalate' then select * into r from public.reports where id=r.id and expires_at>now() for update;end if;
 if not found then raise exception 'NOT_FOUND'; end if;
 select config into c from private.support_center_settings where id;
 select * into t from public.support_tickets where report_id=r.id and category='PUBLIC_REPORT';
 escalation_at:=case when r.owner_response='CANNOT_REACH_NOW' then r.created_at else r.created_at+make_interval(mins=>(c->>'escalationMinutes')::int) end;
 allowed:=(c->>'enabled')::boolean and r.status in ('CREATED','ACTIVE','ACKNOWLEDGED') and (r.owner_response is null or r.owner_response='CANNOT_REACH_NOW') and now()>=escalation_at;
 if p_action='escalate' and t.id is null then
  if allowed is not true then raise exception 'NOT_READY'; end if;
  insert into public.support_tickets(requester_id,category,subject,description,report_id,vehicle_id,code_id)
  values(null,'PUBLIC_REPORT','متابعة بلاغ سيارة','طلب المبلّغ مساعدة الدعم في متابعة البلاغ.',r.id,r.vehicle_id,r.code_id) returning * into t;
  insert into public.report_events(report_id,event_type,safe_metadata) values(r.id,'SUPPORT_ESCALATED',jsonb_build_object('ticketId',t.id));
 end if;
 call_at:=t.created_at+make_interval(mins=>(c->>'callMinutes')::int);
 callable:=coalesce((c->>'enabled')::boolean and t.id is not null and t.status not in ('CLOSED','RESOLVED') and r.status not in ('RESOLVED','BLOCKED','EXPIRED') and now()>=call_at
  and jsonb_array_length(c->'phones')>0 and not exists(select 1 from public.support_messages where ticket_id=t.id and not is_internal),false);
 return jsonb_build_object('serverNow',clock_timestamp(),'liveTopic','report:'||r.live_topic::text,'reference',upper(left(r.id::text,8)),'vehicle',(select jsonb_build_object('manufacturer',v.manufacturer,'model',v.model,'color',v.color) from public.vehicles v where v.id=r.vehicle_id),'reportType',r.report_type_code,'status',r.status,'ownerResponse',r.owner_response,'createdAt',r.created_at,'updatedAt',r.updated_at,'expiresAt',r.expires_at,
 'support',jsonb_build_object('enabled',c->'enabled','canEscalate',allowed and t.id is null,'escalationAt',escalation_at,
 'ticket',case when t.id is not null then jsonb_build_object('id',t.id,'status',t.status,'createdAt',t.created_at) else null end,
 'messages',(select coalesce(jsonb_agg(m order by m."createdAt",m.id),'[]') from (select id,body,created_at as "createdAt" from public.support_messages where ticket_id=t.id and not is_internal order by created_at desc,id desc limit 100) m),
 'canCall',callable,'callAt',call_at,'contact',case when callable then jsonb_build_object('phones',c->'phones','hours',c->>'hours','instructions',c->>'instructions') else null end));
end $function$;
commit;
