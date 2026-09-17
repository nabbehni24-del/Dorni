alter table public.profiles alter column phone drop not null;
alter table public.profiles add column if not exists email text;
create unique index if not exists profiles_email_unique on public.profiles (lower(email)) where email is not null;

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, phone, email)
  values (new.id, new.phone, lower(new.email));

  insert into public.notification_preferences(user_id, sms_enabled)
  values (new.id, new.phone is not null);

  if new.phone is not null then
    insert into public.contact_methods(user_id, kind, destination, verified_at)
    values (new.id, 'PRIMARY_PHONE', new.phone, now());
  end if;
  return new;
end $$;

update public.profiles p
set email = lower(u.email)
from auth.users u
where p.id = u.id and p.email is null and u.email is not null;
