-- Remove the global scanner cooldown. The active-code check and five-minute
-- same-code/same-reason aggregation remain in place.
do $migration$
declare
  definition text;
  cooldown_clause constant text := $clause$  if exists(select 1 from public.scanner_sessions where session_hash=p_session_hash and created_at>now()-interval '1 minute') then raise exception 'RATE_LIMITED' using errcode='P0001'; end if;$clause$;
begin
  definition := pg_get_functiondef('public.submit_public_report(text,text,text,text,text,numeric,numeric)'::regprocedure);
  if definition is null then
    raise exception 'submit_public_report function not found';
  end if;
  if position(cooldown_clause in definition) = 0 then
    raise exception 'Expected scanner cooldown clause not found; refusing to change another version of the function';
  end if;
  execute replace(definition, cooldown_clause, '');
end
$migration$;
