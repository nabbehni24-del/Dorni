-- Staging checkpoint: apply BEFORE disabling Auth's Confirm Email setting.
-- Auth auto-confirmation is account usability, never proof of mailbox ownership.
begin;

create table private.email_ownership_proofs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email <> ''),
  verified_at timestamptz not null,
  source text not null check (source = 'SUPABASE_EMAIL_OTP'),
  evidence_id text not null unique check (length(evidence_id) > 0)
);
alter table private.email_ownership_proofs enable row level security;
revoke all on private.email_ownership_proofs from public, anon, authenticated;
-- Deliberately no backfill from email_confirmed_at or user-editable metadata.
-- No application writer exists until a real OTP verification path is implemented.

create function private.email_ownership_verified(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.email_ownership_proofs p
    join auth.users u on u.id=p.user_id
    where p.user_id=p_user_id and p.email=lower(u.email)
      and u.email_confirmed_at is not null and p.verified_at<=now()
  );
$$;
revoke all on function private.email_ownership_verified(uuid) from public,anon,authenticated;

-- Patch only known, reviewed predicates. Abort on drift instead of silently
-- leaving an auto-confirmed address able to accept an organization invitation.
do $$
declare r record; definition text; replacement text;
begin
  for r in select * from (values
    ('private.provision_account(uuid)',
     'v_account_type <> ''partner'' or v_user.email_confirmed_at is null',
     'v_account_type <> ''partner'' or not private.email_ownership_verified(v_user.id)'),
    ('private.support_staff_admin(text,jsonb)',
     'and a.email_confirmed_at is not null and p.account_status',
     'and private.email_ownership_verified(a.id) and p.account_status'),
    ('public.claim_partner_invitation(text)',
     'where id=v_user and email_confirmed_at is not null',
     'where id=v_user and private.email_ownership_verified(v_user)'),
    ('public.register_my_partner_organization(text,text,text)',
     'if v_confirmed is null then',
     'if not private.email_ownership_verified(v_user) then')
  ) as patches(signature,old_text,new_text)
  loop
    definition:=pg_get_functiondef(r.signature::regprocedure);
    if position(r.old_text in definition)=0 then
      raise exception 'CONTACT_PROOF_BASELINE_MISMATCH: %',r.signature;
    end if;
    replacement:=replace(definition,r.old_text,r.new_text);
    execute replacement;
  end loop;
end $$;

-- Owner-only projection. Never expose another user's contact proof.
create function public.my_email_verification()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid := private.commercial_user();
begin
  if u is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object('verified',private.email_ownership_verified(u));
end $$;
revoke all on function public.my_email_verification() from public,anon;
grant execute on function public.my_email_verification() to authenticated;

-- Configure this as the Send Email Auth Hook before allowing unconfirmed signup.
-- The block is upstream of the public Auth API: hiding a UI button is not enough.
-- Support-issued, audited admin links remain a separate privileged workflow.
create function public.support_only_auth_email(event jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('error',jsonb_build_object(
    'http_code',403,'message','Email authentication is unavailable. Contact Dorni support.'
  ));
$$;
revoke all on function public.support_only_auth_email(jsonb) from public,anon,authenticated;
grant execute on function public.support_only_auth_email(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

-- Staff invitation activation remains distinct from contact proof. The existing
-- support_staff_provision check uses email_confirmed_at only to ensure a newly
-- admin-created, passwordless account is not an existing activated account.
commit;
