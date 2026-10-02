-- Reviewed consumers use authenticated owner/issuer sessions, not service_role.
-- The obsolete private helper has no function, policy or application callers.
begin;
revoke execute on function private.is_partner_admin(uuid) from public,anon,authenticated,service_role;
revoke execute on function public.claim_dorni_code(text,text,uuid) from service_role;
revoke execute on function public.create_code_batch(uuid,text,text,jsonb) from service_role;
revoke execute on function public.respond_to_report(uuid,text) from service_role;
commit;
