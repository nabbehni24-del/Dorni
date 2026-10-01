-- Apply after reporter_reliability.sql. Preserve capability checks, locks and grants.
-- A confirmed inability to reach the vehicle bypasses only the owner-response wait.
do $$
declare definition text; previous text; replacement text;
begin
 definition:=pg_get_functiondef('private.report_support(text,text)'::regprocedure);
 previous:='escalation_at:=r.created_at+make_interval(mins=>(c->>''escalationMinutes'')::int);';
 replacement:='escalation_at:=case when r.owner_response=''CANNOT_REACH_NOW'' then r.created_at else r.created_at+make_interval(mins=>(c->>''escalationMinutes'')::int) end;';
 if strpos(definition,previous)=0 then raise exception 'Unexpected escalation deadline definition';end if;
 execute replace(definition,previous,replacement);
end $$;
