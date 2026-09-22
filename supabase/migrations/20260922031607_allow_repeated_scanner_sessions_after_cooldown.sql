-- The scanner token identifies a browser, not a one-time report. Keep its
-- history so the one-minute rate limit still works, but allow later scans.
alter table public.scanner_sessions
  drop constraint if exists scanner_sessions_session_hash_key;

create index if not exists scanner_sessions_session_hash_created_at_idx
  on public.scanner_sessions (session_hash, created_at desc);
