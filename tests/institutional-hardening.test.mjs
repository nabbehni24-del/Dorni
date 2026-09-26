import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("institutional tenant relationships are enforced by composite foreign keys",async()=>{
  const sql=await read("supabase/migrations/20260926170000_institutional_relational_hardening.sql");
  assert.match(sql,/foreign key \(role_id, organization_id\)/);
  assert.match(sql,/foreign key \(membership_id, organization_id, actor_id\)/);
  assert.match(sql,/foreign key \(action_type, reason_code\)/);
  assert.match(sql,/foreign key \(code_assignment_id, code_id, vehicle_id\)/);
});

test("institutional verification is explicit and required for effective permissions",async()=>{
  const sql=await read("supabase/migrations/20260926170000_institutional_relational_hardening.sql");
  assert.match(sql,/institutional_status in \('NOT_VERIFIED','VERIFIED','SUSPENDED','REJECTED'\)/);
  assert.match(sql,/o\.institutional_status='VERIFIED'/);
  assert.match(sql,/ORGANIZATION_NOT_ACTIVE/);
});

test("invitation lifecycle supports replacement, revocation, expiry, and single use",async()=>{
  const [sql,route]=await Promise.all([read("supabase/migrations/20260926170000_institutional_relational_hardening.sql"),read("app/api/institutional/members/route.ts")]);
  assert.match(sql,/partner_invitations_one_active_email_idx/);
  assert.match(sql,/claimed_at is null and revoked_at is null and expires_at>now\(\)/);
  assert.match(sql,/org_revoke_invitation/);
  assert.match(route,/revoke-invitation/);
});

test("member role changes and the last institutional admin are protected",async()=>{
  const [sql,route]=await Promise.all([read("supabase/migrations/20260926170000_institutional_relational_hardening.sql"),read("app/api/institutional/members/route.ts")]);
  assert.match(sql,/org_set_member_role/);
  assert.match(sql,/LAST_ADMIN_REQUIRED/g);
  assert.match(route,/org_set_member_role/);
});

test("acknowledged actions have a real completion transition and live organization refresh",async()=>{
  const [sql,route,workspace]=await Promise.all([read("supabase/migrations/20260926170000_institutional_relational_hardening.sql"),read("app/api/institutional/actions/[id]/complete/route.ts"),read("components/institutional-workspace.tsx")]);
  assert.match(sql,/v_action\.status<>'ACKNOWLEDGED'/);
  assert.match(sql,/ACTION_COMPLETED/);
  assert.match(route,/complete_institutional_action/);
  assert.match(workspace,/setInterval\(\(\)=>void load\(true\),15000\)/);
});

