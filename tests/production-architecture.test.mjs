import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath=new URL("../supabase/migrations/20260917173000_dorni_foundation.sql",import.meta.url);
const envPath=new URL("../.env.example",import.meta.url);

test("production schema enables RLS and exposes only narrow public capabilities",async()=>{const sql=await readFile(migrationPath,"utf8");for(const table of ["profiles","vehicles","codes","code_claims","code_assignments","reports","partner_memberships","support_tickets","production_exports","audit_logs"]){assert.match(sql,new RegExp(`alter table public\\.%I enable row level security|alter table public\\.${table} enable row level security`),`${table} must be covered by the RLS activation block`);}assert.match(sql,/revoke all on function public\.claim_dorni_code/);assert.match(sql,/grant execute on function public\.claim_dorni_code\(text,text,uuid\) to authenticated/);assert.doesNotMatch(sql,/grant select[^;]+code_claims[^;]+to anon/i);});

test("claim, report and batch workflows are transactional database functions",async()=>{const sql=await readFile(migrationPath,"utf8");assert.match(sql,/function public\.claim_dorni_code/);assert.match(sql,/for update/);assert.match(sql,/function public\.submit_public_report/);assert.match(sql,/REPORT_AGGREGATED/);assert.match(sql,/function public\.create_code_batch/);assert.match(sql,/idempotency_key/);});

test("deployment configuration keeps server secrets non-public",async()=>{const env=await readFile(envPath,"utf8");assert.match(env,/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);assert.match(env,/SUPABASE_SECRET_KEY/);assert.doesNotMatch(env,/NEXT_PUBLIC_SUPABASE_SECRET/);assert.match(env,/DORNI_NOTIFICATION_MODE=provider/);});
