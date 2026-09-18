import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration=new URL("../supabase/migrations/20260918120000_real_accounts_and_partner_codes.sql",import.meta.url);
const selfServiceMigration=new URL("../supabase/migrations/20260918133000_partner_self_service_qr.sql",import.meta.url);
const durableAccountsMigration=new URL("../supabase/migrations/20260918150000_durable_account_provisioning.sql",import.meta.url);
const login=new URL("../app/login/page.tsx",import.meta.url);
const accountContext=new URL("../lib/server/account.ts",import.meta.url);
const authCallback=new URL("../app/auth/callback/route.ts",import.meta.url);
const partnerRoute=new URL("../app/api/partner/[...action]/route.ts",import.meta.url);

test("login uses durable password accounts instead of the temporary phone OTP",async()=>{const source=await readFile(login,"utf8");assert.match(source,/api\/auth\/login/);assert.match(source,/api\/auth\/signup/);assert.match(source,/شركة \/ شريك/);assert.doesNotMatch(source,/0911111111|246810|request-otp/);});

test("partner invitations are email-bound, expiring, and claimed transactionally",async()=>{const sql=await readFile(migration,"utf8");assert.match(sql,/create table if not exists public\.partner_invitations/);assert.match(sql,/expires_at>now\(\).*for update/s);assert.match(sql,/lower\(v_inv\.email\)<>v_email/);assert.match(sql,/on conflict \(organization_id,user_id\) do update/);});

test("partner code generation requires explicit trusted organization authorization",async()=>{const sql=await readFile(migration,"utf8");assert.match(sql,/o\.trusted_generation/);assert.match(sql,/private\.can_generate_for_partner\(p_organization_id\)/);assert.match(sql,/v_actor:='PARTNER'/);assert.match(sql,/partner_codes_read/);assert.match(sql,/partner_exports_read/);});

test("companies can self-register only after verified email and receive durable membership",async()=>{const sql=await readFile(selfServiceMigration,"utf8");assert.match(sql,/register_my_partner_organization/);assert.match(sql,/email_confirmed_at/);assert.match(sql,/PARTNER_ADMIN','ACTIVE'/);assert.match(sql,/PARTNER_SELF_REGISTERED/);assert.match(sql,/generation_limit_per_day/);});

test("account and company provisioning is database-owned, idempotent, and repaired on login",async()=>{const [sql,context,callback]=await Promise.all([readFile(durableAccountsMigration,"utf8"),readFile(accountContext,"utf8"),readFile(authCallback,"utf8")]);assert.match(sql,/create or replace function private\.provision_account/);assert.match(sql,/on conflict \(id\) do update/);assert.match(sql,/after update of email, phone, email_confirmed_at, raw_user_meta_data on auth\.users/);assert.match(sql,/Repair confirmed company accounts/);assert.match(context,/rpc\("provision_my_account"\)/);assert.match(callback,/rpc\("provision_my_account"\)/);});

test("temporary phone and anonymous account endpoints are permanently disabled",async()=>{const routes=await Promise.all([readFile(new URL("../app/api/auth/request-otp/route.ts",import.meta.url),"utf8"),readFile(new URL("../app/api/auth/verify-otp/route.ts",import.meta.url),"utf8")]);for(const source of routes){assert.match(source,/410/);assert.doesNotMatch(source,/signInAnonymously|signInWithOtp|verifyOtp|DORNI_TEST_PHONE_AUTH/);}});

test("partner generation has a database-enforced daily quota",async()=>{const sql=await readFile(selfServiceMigration,"utf8");assert.match(sql,/v_used_today\+v_count>v_daily_limit/);assert.match(sql,/PARTNER_DAILY_LIMIT/);assert.match(sql,/date_trunc\('day',now\(\)\)/);});

test("partner QR endpoint renders authenticated real scan payloads",async()=>{const source=await readFile(partnerRoute,"utf8");assert.match(source,/QRCode\.toString/);assert.match(source,/supabase\.from\("codes"\)/);assert.match(source,/\/t\/\$\{code\.public_token\}/);assert.match(source,/private, no-store/);});
