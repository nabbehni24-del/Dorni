begin;
-- Publish only the administrator's support-center contact information, never
-- personal contact_methods/profiles or configuration used for escalation.
create function public.account_recovery_contacts()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_build_object(
    'phones',case when (config->>'enabled')::boolean then config->'phones' else '[]'::jsonb end,
    'hours',case when (config->>'enabled')::boolean then config->>'hours' else null end
  ) from private.support_center_settings where id),'{}'::jsonb);
$$;
revoke all on function public.account_recovery_contacts() from public;
grant execute on function public.account_recovery_contacts() to anon,authenticated;
commit;
