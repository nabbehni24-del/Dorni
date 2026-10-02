begin;
-- No application client needs table-maintenance or schema-level privileges.
revoke truncate, references, trigger, maintain on all tables in schema public from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate, references, trigger, maintain on tables from public, anon, authenticated;
commit;
