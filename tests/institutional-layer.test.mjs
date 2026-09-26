import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("organization type is classification and effective authority requires entitlement plus role permission",async()=>{
  const sql=await read("supabase/migrations/20260926120000_institutional_foundation.sql");
  assert.match(sql,/organization_entitlements/);
  assert.match(sql,/organization_role_permissions/);
  assert.match(sql,/private\.has_org_permission/);
  assert.match(sql,/o\.institutional_enabled/);
  assert.doesNotMatch(sql,/type\s*=\s*'TRAFFIC'.*VEHICLE_MOVE_REQUEST/is);
});

test("only move requests are seeded and they require controlled structured reasons",async()=>{
  const sql=await read("supabase/migrations/20260926120000_institutional_foundation.sql");
  assert.match(sql,/VEHICLE_MOVE_REQUEST/);
  assert.match(sql,/BLOCKING_ACCESS/);
  assert.match(sql,/OBSTRUCTING_TRAFFIC/);
  assert.match(sql,/SAFETY_REASON/);
  assert.match(sql,/REASON_NOTE_REQUIRED/);
  for(const forbidden of ["VEHICLE_TOW_COMPLETED","VEHICLE_SUMMON_REQUEST","VEHICLE_TOW_WARNING"])assert.doesNotMatch(sql,new RegExp(`\\('${forbidden}'`));
});

test("institutional mutation is transactional, idempotent, throttled and does not accept owner identity",async()=>{
  const [sql,route]=await Promise.all([read("supabase/migrations/20260926120000_institutional_foundation.sql"),read("app/api/institutional/actions/route.ts")]);
  assert.match(sql,/unique \(membership_id, idempotency_key\)/);
  assert.match(sql,/RATE_LIMITED/);
  assert.match(sql,/DUPLICATE_ACTIVE_REQUEST/);
  assert.match(sql,/select c\.id,a\.vehicle_id,v\.owner_id/);
  assert.doesNotMatch(route,/ownerId|phone|email/);
});

test("anonymous public scan remains present while institutional context is isolated",async()=>{
  const [page,publicRoute,contextRoute]=await Promise.all([read("app/t/[token]/page.tsx"),read("app/api/public/codes/[token]/route.ts"),read("app/api/institutional/scan/[token]/route.ts")]);
  assert.match(page,/PublicReportClient/);
  assert.match(page,/InstitutionalScanPanel/);
  assert.match(publicRoute,/manufacturer:row\.manufacturer,model:row\.model,color:row\.color/);
  assert.match(contextRoute,/get_institutional_scan_context/);
});

test("owner acknowledgement and verified notification have a structured response without owner PII",async()=>{
  const [sql,owner]=await Promise.all([read("supabase/migrations/20260926120000_institutional_foundation.sql"),read("components/owner-institutional-alerts.tsx")]);
  assert.match(sql,/p_response not in \('SEEN','WILL_MOVE'\)/);
  assert.match(sql,/INSTITUTIONAL_ACTION_ACKNOWLEDGED/);
  assert.match(owner,/تم الاطلاع/);
  assert.match(owner,/سأحرك المركبة/);
  assert.doesNotMatch(owner,/owner.*(?:phone|email)|phone.*owner|email.*owner/i);
});

test("suspension and membership reads are enforced by database authorization",async()=>{
  const [sql,access]=await Promise.all([read("supabase/migrations/20260926120000_institutional_foundation.sql"),read("lib/server/access.ts")]);
  assert.match(sql,/ORG_MEMBER_SUSPEND/);
  assert.match(sql,/m\.status='ACTIVE'/);
  assert.match(sql,/drop policy if exists partner_members_read/);
  assert.match(sql,/private\.has_org_permission\(organization_id,'ORG_MEMBER_VIEW'\)/);
  assert.match(access,/organization\.status!=="ACTIVE"/);
  assert.doesNotMatch(access,/\.limit\(1\)\.maybeSingle/);
});

test("privilege changes, invitations, activation and actions are audited",async()=>{
  const sql=await read("supabase/migrations/20260926120000_institutional_foundation.sql");
  for(const event of ["ORGANIZATION_ENTITLEMENT_GRANTED","ORGANIZATION_ENTITLEMENT_REVOKED","ORGANIZATION_ROLE_UPSERTED","ORGANIZATION_MEMBER_INVITED","ORGANIZATION_MEMBER_ACTIVATED","ORGANIZATION_MEMBER_SUSPENDED","INSTITUTIONAL_ACCESS_ENABLED","INSTITUTIONAL_MOVE_REQUEST_CREATED"])assert.match(sql,new RegExp(event));
});

test("institutional reports are organization-scoped and contain no owner contact projection",async()=>{
  const sql=await read("supabase/migrations/20260926120000_institutional_foundation.sql");
  const start=sql.indexOf("create or replace function public.get_organization_institutional_overview");
  const end=sql.indexOf("create or replace function public.org_upsert_role",start);
  const report=sql.slice(start,end);
  assert.match(report,/organization_id=p_organization_id/g);
  assert.match(report,/ORG_REPORT_VIEW/);
  assert.doesNotMatch(report,/contact_methods|destination|phone/);
});
