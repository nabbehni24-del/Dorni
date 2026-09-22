import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const foundation = new URL("../supabase/migrations/20260917173000_dorni_foundation.sql", import.meta.url);
const fix = new URL("../supabase/migrations/20260922031607_allow_repeated_scanner_sessions_after_cooldown.sql", import.meta.url);
const noCooldown = new URL("../supabase/migrations/20260922032227_remove_public_report_scanner_cooldown.sql", import.meta.url);

test("a scanner can report again without a permanent uniqueness lock or cooldown", async () => {
  const [baseSql, fixSql, noCooldownSql] = await Promise.all([readFile(foundation, "utf8"), readFile(fix, "utf8"), readFile(noCooldown, "utf8")]);
  assert.match(baseSql, /session_hash=p_session_hash and created_at>now\(\)-interval '1 minute'/);
  assert.match(fixSql, /drop constraint if exists scanner_sessions_session_hash_key/);
  assert.match(fixSql, /create index if not exists scanner_sessions_session_hash_created_at_idx/);
  assert.match(fixSql, /\(session_hash, created_at desc\)/);
  assert.match(noCooldownSql, /execute replace\(definition, cooldown_clause, ''\)/);
  assert.match(noCooldownSql, /Expected scanner cooldown clause not found/);
});
