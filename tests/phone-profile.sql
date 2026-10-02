\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,phone,phone_confirmed_at) values
 ('00000000-0000-4000-8000-000000000901','phone-test@example.invalid','218912345678',clock_timestamp()),
 ('00000000-0000-4000-8000-000000000902','phone-other@example.invalid',null,null),
 ('00000000-0000-4000-8000-000000000903','phone-legacy@example.invalid','447911123456',clock_timestamp());
insert into auth.sessions(id,user_id) select id,id from auth.users where id::text like '00000000-0000-4000-8000-00000000090%';
insert into public.partner_organizations(id,name,type,status) values('00000000-0000-4000-8000-000000000904','Phone isolation issuer','CORPORATE','ACTIVE');
insert into public.partner_memberships(organization_id,user_id,role,status) values('00000000-0000-4000-8000-000000000904','00000000-0000-4000-8000-000000000902','PARTNER_ADMIN','ACTIVE');
do $$declare v text;begin
 foreach v in array array['0912345678','912345678','+218912345678','00218912345678','218912345678','٠٩١ ٢٣٤ ٥٦٧٨','۰۹۱۲۳۴۵۶۷۸','(091) 234-5678'] loop
  if private.normalize_libyan_phone(v)<>'+218912345678' then raise exception 'Normalization failed: %',v;end if;
 end loop;
 if private.normalize_libyan_phone('0212345678')<>'+218212345678' then raise exception 'Fixed line rejected';end if;
 foreach v in array array['abc0912345678','09123','09123456789','+2180912345678','++218912345678','0912345678 ext 3','0992345678','0000000000','2345678','+447911123456','0912345678/0923456789','(0912345678','091)2345678'] loop
  begin perform private.normalize_libyan_phone(v);raise exception 'Invalid phone accepted: %',v;exception when sqlstate '22023' then null;end;
 end loop;
 if private.normalize_libyan_phone('') is not null then raise exception 'Empty not removed';end if;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000901"}',true);
set local role authenticated;
do $$declare j jsonb;begin
 j:=public.phone_profile('get');if not (j->>'verified')::boolean then raise exception 'Genuine legacy proof lost';end if;
 j:=public.phone_profile('save','092 345 6789','218912345678');
 if j->>'phone'<>'+218923456789' or (j->>'verified')::boolean then raise exception 'Edit preserved proof';end if;
 begin update public.profiles set phone_changed_at=null where id=auth.uid();raise exception 'Timestamp forgery allowed';exception when insufficient_privilege then null;end;
 update public.contact_methods set verified_at=clock_timestamp() where user_id=auth.uid();
 if exists(select 1 from public.contact_methods where verified_at is not null) then raise exception 'Contact forgery allowed';end if;
 begin perform public.phone_profile('save','0934567890','stale');raise exception 'Lost update accepted';exception when serialization_failure then null;end;
 j:=public.phone_profile('save','0912345678','+218923456789');
 if (j->>'verified')::boolean then raise exception 'Re-added number resurrected old proof';end if;
 perform public.provision_my_account();
 j:=public.phone_profile('get');if j->>'phone'<>'+218912345678' then raise exception 'Provision overwrote phone';end if;
 j:=public.phone_profile('save',null,'+218912345678');
 perform public.provision_my_account();
 j:=public.phone_profile('get');if j->>'phone' is not null or (j->>'verified')::boolean then raise exception 'Removed phone resurrected';end if;
 j:=public.phone_profile('save','0945678901',null);
 if (j->>'verified')::boolean then raise exception 'Add auto-verified';end if;
 if exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000903') then raise exception 'Other profile visible';end if;
end$$;
reset role;
update auth.users set phone='218945678901',phone_confirmed_at=clock_timestamp() where id='00000000-0000-4000-8000-000000000901';
set local role authenticated;
do $$begin if not (public.phone_profile('get')->>'verified')::boolean then raise exception 'Fresh matching Auth proof ignored';end if;end$$;
reset role;
update auth.users set phone_confirmed_at=null where id='00000000-0000-4000-8000-000000000901';
set local role authenticated;
do $$begin if (public.phone_profile('get')->>'verified')::boolean then raise exception 'Revoked Auth proof retained';end if;end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000902"}',true);
set local role authenticated;
do $$begin
 if public.phone_profile('get')->>'phone' is not null then raise exception 'Other owner phone leaked';end if;
 if exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000901') then raise exception 'Company member can read owner profile';end if;
 if exists(select 1 from public.contact_methods where user_id<>'00000000-0000-4000-8000-000000000902') then raise exception 'Contacts leaked';end if;
end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true),set_config('request.jwt.claims','{"session_id":"00000000-0000-4000-8000-000000000903"}',true);
set local role authenticated;
do $$begin if public.phone_profile('get')->>'phone'<>'447911123456' or not (public.phone_profile('get')->>'verified')::boolean then raise exception 'Legacy international account changed';end if;end$$;
reset role;
delete from auth.sessions where id='00000000-0000-4000-8000-000000000903';
set local role authenticated;
do $$begin begin perform public.phone_profile('get');raise exception 'Revoked session allowed';exception when insufficient_privilege then null;end;end$$;
reset role;
set local role anon;
do $$begin begin perform public.phone_profile('get');raise exception 'Anonymous phone read allowed';exception when insufficient_privilege then null;end;end$$;
reset role;
rollback;
\echo 'PASS phone: normalization, invalid input, add/edit/remove, current Auth proof, proof reset, forgery denial, provisioning stability, legacy preservation, owner isolation and revoked session'
