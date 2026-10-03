-- Staging verification repair: preserve the existing security wrapper and grants.
-- The PL/pgSQL record r conflicts with the list query's relation alias r.
do $repair$
declare
  definition text := pg_get_functiondef('private.manage_renewal_requests(text,jsonb)'::regprocedure);
  old_query text := 'select r.id,r.created_at,c.serial_number,p.name as plan from public.service_renewal_requests r join public.endpoint_services s on s.id=r.service_id join public.codes c on c.id=s.current_code_id join public.service_plan_versions v on v.id=r.plan_version_id join public.service_plans p on p.id=v.plan_id where r.status=''PENDING'' order by r.created_at limit 200';
  new_query text := 'select pending.id,pending.created_at,c.serial_number,p.name as plan from public.service_renewal_requests pending join public.endpoint_services s on s.id=pending.service_id join public.codes c on c.id=s.current_code_id join public.service_plan_versions v on v.id=pending.plan_version_id join public.service_plans p on p.id=v.plan_id where pending.status=''PENDING'' order by pending.created_at limit 200';
begin
  if position(old_query in definition)=0 then
    raise exception 'Renewal list definition differs; review before applying';
  end if;
  execute replace(definition,old_query,new_query);
end
$repair$;
