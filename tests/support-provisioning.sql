-- Every fixture and audit record is rolled back, even after successful assertions.
do $test$
declare a uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); session uuid:=gen_random_uuid();
begin
 begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) values
  (a,a::text||'@provision-test.invalid',now(),'{}','{}'),
  (s,s::text||'@provision-test.invalid',null,'{}',jsonb_build_object('staff_provisioned_by',a)),
  (outsider,outsider::text||'@provision-test.invalid',null,jsonb_build_object('staff_provisioned_by',a),'{}');
  insert into auth.sessions(id,user_id,created_at) values(session,a,now());
  insert into public.internal_memberships(user_id,role_code) values(a,'SUPER_ADMIN');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'session_id',session,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  begin perform public.support_staff_provision(outsider,array['view']);raise exception 'FAIL user metadata accepted';exception when insufficient_privilege then null;end;
  perform public.support_staff_provision(s,array['view','reply']);
  if not exists(select 1 from jsonb_array_elements(public.support_staff_admin('list')) j where j->>'id'=s::text and j->>'activated'='false') then raise exception 'FAIL pending staff missing';end if;
  begin perform public.support_staff_provision(s,array['view']);raise exception 'FAIL duplicate grant';exception when raise_exception then if sqlerrm<>'ROLE_CONFLICT' then raise;end if;end;
  perform set_config('role','none',true);
  if not exists(select 1 from public.audit_logs where entity_id=s and action='SUPPORT_STAFF_CREATE') then raise exception 'FAIL audit';end if;
  update public.internal_memberships set active=false where user_id=a;
  perform set_config('role','authenticated',true);
  begin perform public.support_staff_provision(outsider,array['view']);raise exception 'FAIL revoked admin accepted';exception when insufficient_privilege then null;end;
  raise exception 'ROLLBACK_PROVISION_TEST';
 exception when raise_exception then if sqlerrm<>'ROLLBACK_PROVISION_TEST' then raise;end if;
 end;
 if exists(select 1 from auth.users where id in(a,s,outsider)) then raise exception 'FAIL fixture leak';end if;
end $test$;
