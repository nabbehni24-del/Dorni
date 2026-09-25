import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const migration=new URL("../supabase/migrations/20260925120000_admin_control_plane.sql",import.meta.url);
const adminPage=new URL("../app/admin/page.tsx",import.meta.url);
const adminOverview=new URL("../app/api/admin/overview/route.ts",import.meta.url);
const adminPartnerReview=new URL("../app/api/admin/partners/[id]/route.ts",import.meta.url);
const adminBatchReview=new URL("../app/api/admin/batch-requests/[id]/route.ts",import.meta.url);
const partnerPage=new URL("../app/partner/page.tsx",import.meta.url);
const access=new URL("../lib/server/access.ts",import.meta.url);

test("new partner registrations stay pending and cannot generate before approval",async()=>{
  const [sql,page,accessSource]=await Promise.all([readFile(migration,"utf8"),readFile(partnerPage,"utf8"),readFile(access,"utf8")]);
  assert.match(sql,/values\s*\(\s*v_company_name,\s*v_company_type,\s*'PENDING',\s*false/s);
  assert.match(sql,/PARTNER_APPLICATION_SUBMITTED/);
  assert.match(sql,/o\.status='ACTIVE'/);
  assert.match(page,/organization\.status==="ACTIVE"/);
  assert.match(page,/disabled=\{!active/);
  assert.match(accessSource,/review_note,reviewed_at/);
});

test("admin mutations require the one super-admin role at both API and database layers",async()=>{
  const sources=await Promise.all([
    readFile(migration,"utf8"),readFile(adminOverview,"utf8"),readFile(adminPartnerReview,"utf8"),readFile(adminBatchReview,"utf8")
  ]);
  for(const source of sources)assert.match(source,/SUPER_ADMIN/);
  assert.match(sources[0],/revoke all on function public\.admin_set_partner_status/);
  assert.match(sources[0],/revoke all on function public\.admin_review_batch_request/);
  assert.match(sources[0],/reviewed_by=v_user/);
});

test("the admin control plane exposes approvals, operations, monitoring, and an audit trail",async()=>{
  const source=await readFile(adminPage,"utf8");
  for(const capability of ["الشركات والموزعون","طلبات الأكواد","الإنتاج والعمليات","سجل الإدارة","اعتماد وتفعيل","إيقاف مؤقت"]){
    assert.match(source,new RegExp(capability));
  }
  assert.match(source,/\/api\/admin\/partners\/\$\{org\.id\}/);
  assert.match(source,/\/api\/admin\/batch-requests\/\$\{item\.id\}/);
});

