import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration=new URL("../supabase/migrations/20260918120000_real_accounts_and_partner_codes.sql",import.meta.url);
const login=new URL("../app/login/page.tsx",import.meta.url);

test("login uses durable password accounts instead of the temporary phone OTP",async()=>{const source=await readFile(login,"utf8");assert.match(source,/api\/auth\/login/);assert.match(source,/api\/auth\/signup/);assert.match(source,/شركة \/ شريك/);assert.doesNotMatch(source,/0911111111|246810|request-otp/);});

test("partner invitations are email-bound, expiring, and claimed transactionally",async()=>{const sql=await readFile(migration,"utf8");assert.match(sql,/create table if not exists public\.partner_invitations/);assert.match(sql,/expires_at>now\(\).*for update/s);assert.match(sql,/lower\(v_inv\.email\)<>v_email/);assert.match(sql,/on conflict \(organization_id,user_id\) do update/);});

test("partner code generation requires explicit trusted organization authorization",async()=>{const sql=await readFile(migration,"utf8");assert.match(sql,/o\.trusted_generation/);assert.match(sql,/private\.can_generate_for_partner\(p_organization_id\)/);assert.match(sql,/v_actor:='PARTNER'/);assert.match(sql,/partner_codes_read/);assert.match(sql,/partner_exports_read/);});
