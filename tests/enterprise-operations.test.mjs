import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("enterprise operations model has tenant-safe structure and scope relationships",async()=>{
  const sql=await read("supabase/migrations/20260926183000_enterprise_operations_platform.sql");
  assert.match(sql,/create table public\.organization_sites/);
  assert.match(sql,/create table public\.organization_units/);
  assert.match(sql,/create table public\.organization_member_scopes/);
  assert.match(sql,/create table public\.organization_inventory_allocations/);
  assert.match(sql,/foreign key\(site_id,organization_id\)/);
  assert.match(sql,/foreign key\(unit_id,organization_id\)/);
  assert.match(sql,/enable row level security/g);
});

test("enterprise cases support ownership, SLA, escalation, and optimistic concurrency",async()=>{
  const sql=await read("supabase/migrations/20260926183000_enterprise_operations_platform.sql");
  assert.match(sql,/assigned_membership_id uuid/);
  assert.match(sql,/sla_due_at timestamptz/);
  assert.match(sql,/escalation_level smallint/);
  assert.match(sql,/EXPECTED_VERSION_REQUIRED|expected_updated_at/i);
  assert.match(sql,/ACTION_CONFLICT/);
});

test("enterprise API rejects cross-origin mutations and delegates to secured RPCs",async()=>{
  const route=await read("app/api/institutional/enterprise/route.ts");
  assert.match(route,/validPushOrigin/);
  assert.match(route,/org_upsert_site/);
  assert.match(route,/org_upsert_unit/);
  assert.match(route,/org_assign_member_scope/);
  assert.match(route,/org_manage_operation/);
  assert.match(route,/org_set_sla_policy/);
  assert.match(route,/org_allocate_inventory/);
});

test("company portal exposes an operational command center rather than decorative metrics",async()=>{
  const [portal,consoleUi]=await Promise.all([
    read("app/partner/page.tsx"),
    read("components/enterprise-console.tsx"),
  ]);
  assert.match(portal,/section="operations"/);
  assert.match(portal,/section="structure"/);
  assert.match(portal,/section="reports"/);
  assert.match(consoleUi,/مركز القيادة/);
  assert.match(consoleUi,/اتفاقيات مستوى الخدمة/);
  assert.match(consoleUi,/الهيكل التنظيمي/);
  assert.match(consoleUi,/تعيين المسؤول/);
  assert.match(consoleUi,/توزيع موظف على نطاق/);
  assert.match(consoleUi,/تسجيل حركة المخزون/);
});

