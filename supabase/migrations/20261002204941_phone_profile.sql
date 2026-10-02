begin;

-- Saved profile phone is not an Auth identity. No bulk rewrite of legacy data.
alter table public.profiles add column phone_changed_at timestamptz;

create function private.normalize_libyan_phone(p_phone text) returns text
language plpgsql immutable set search_path='' as $$
declare n text; national text;
begin
 if p_phone is null or btrim(p_phone)='' then return null;end if;
 if length(p_phone)>64 then raise exception 'INVALID_PHONE' using errcode='22023';end if;
 n:=translate(btrim(p_phone),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789');
 if n ~ '[^0-9+()[:space:]-]' then raise exception 'INVALID_PHONE' using errcode='22023';end if;
 if regexp_replace(n,'\([0-9[:space:]-]+\)','','g') ~ '[()]' then raise exception 'INVALID_PHONE' using errcode='22023';end if;
 n:=regexp_replace(n,'[()[:space:]-]','','g');
 if n ~ '^\+218[0-9]{9}$' then national:=substr(n,5);
 elsif n ~ '^00218[0-9]{9}$' then national:=substr(n,6);
 elsif n ~ '^218[0-9]{9}$' then national:=substr(n,4);
 elsif n ~ '^0[0-9]{9}$' then national:=substr(n,2);
 elsif n ~ '^[0-9]{9}$' then national:=n;
 else raise exception 'INVALID_PHONE' using errcode='22023';end if;
 -- LY mobile/fixed-line ranges: Google libphonenumber metadata, checked 2026-10-02.
 if national !~ '^(9[1-6][0-9]{7}|(2(0[56]|[1-6][0-9]|7[124579]|8[124])|3(1[0-9]|2[2356])|4([17][0-9]|2[1-357]|5[2-4]|8[124])|5([1347][0-9]|2[1-469]|5[13-5]|8[1-4])|6([1-479][0-9]|5[2-57]|8[1-5])|7([13][0-9]|2[13-79])|8([124][0-9]|5[124]|84))[0-9]{6})$' then
  raise exception 'INVALID_PHONE' using errcode='22023';
 end if;
 return '+218'||national;
end$$;
revoke all on function private.normalize_libyan_phone(text) from public,anon,authenticated;

-- A profile edit/removal must survive login, metadata updates and provisioning.
-- Fail closed if the approved provisioning function drifts.
do $$declare definition text;begin
 definition:=pg_get_functiondef('private.provision_account(uuid)'::regprocedure);
 if position('phone = coalesce(excluded.phone, public.profiles.phone)' in definition)=0 or position('if v_user.phone is not null then' in definition)=0 then raise exception 'PROVISIONING_REVIEW_REQUIRED';end if;
 definition:=replace(definition,'phone = coalesce(excluded.phone, public.profiles.phone)','phone = case when public.profiles.phone_changed_at is null then coalesce(excluded.phone, public.profiles.phone) else public.profiles.phone end');
 definition:=replace(definition,'if v_user.phone is not null then','if v_user.phone is not null and not exists(select 1 from public.profiles where id=v_user.id and phone_changed_at is not null) then');
 execute definition;
end$$;

create or replace function private.enforce_contact_verification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.verified_at:=null;
 if new.kind in ('PRIMARY_PHONE','WHATSAPP','SMS') and new.destination ~ '^\+?[1-9][0-9]{7,14}$' then
  select u.phone_confirmed_at into new.verified_at from auth.users u join public.profiles p on p.id=u.id
  where u.id=new.user_id and u.phone_confirmed_at is not null
   and u.phone ~ '^\+?[1-9][0-9]{7,14}$'
   and ltrim(u.phone,'+')=ltrim(new.destination,'+')
   and (p.phone_changed_at is null or u.phone_confirmed_at>=p.phone_changed_at);
 end if;
 return new;
end$$;
revoke all on function private.enforce_contact_verification() from public,anon,authenticated;
update public.contact_methods set verified_at=verified_at;

create function private.phone_profile(p_action text,p_phone text default null,p_expected text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.commercial_user();p public.profiles%rowtype;n text;proof timestamptz;
begin
 select * into p from public.profiles where id=u for update;
 if p_action='save' then
  if p.phone is distinct from p_expected then raise exception 'PHONE_CHANGED' using errcode='40001';end if;
  n:=private.normalize_libyan_phone(p_phone);
  if n is distinct from p.phone then
   update public.profiles set phone=n,phone_changed_at=clock_timestamp(),updated_at=clock_timestamp() where id=u returning * into p;
   update public.contact_methods set enabled=false,verified_at=null where user_id=u and kind in ('PRIMARY_PHONE','SMS','WHATSAPP');
   if n is not null then
    insert into public.contact_methods(user_id,kind,destination,enabled) values(u,'PRIMARY_PHONE',n,true)
    on conflict(user_id,kind,destination) do update set enabled=true,verified_at=null;
   end if;
   insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata)
   values(u,'OWNER',case when n is null then 'PROFILE_PHONE_REMOVED' else 'PROFILE_PHONE_SAVED' end,'profile',u,'{}');
  end if;
 elsif p_action is distinct from 'get' then raise exception 'INVALID_ACTION' using errcode='22023';end if;
 -- Derive truth on every read. Never trust a client flag or stale contact timestamp.
 select phone_confirmed_at into proof from auth.users where id=u
  and phone ~ '^\+?[1-9][0-9]{7,14}$' and p.phone ~ '^\+?[1-9][0-9]{7,14}$'
  and ltrim(phone,'+')=ltrim(p.phone,'+')
  and phone_confirmed_at is not null and (p.phone_changed_at is null or phone_confirmed_at>=p.phone_changed_at);
 return jsonb_build_object('phone',p.phone,'verified',proof is not null);
end$$;
revoke all on function private.phone_profile(text,text,text) from public,anon;
grant execute on function private.phone_profile(text,text,text) to authenticated;
create function public.phone_profile(p_action text,p_phone text default null,p_expected text default null)
returns jsonb language sql security invoker set search_path='' as $$select private.phone_profile(p_action,p_phone,p_expected)$$;
revoke all on function public.phone_profile(text,text,text) from public,anon;
grant execute on function public.phone_profile(text,text,text) to authenticated;
commit;
