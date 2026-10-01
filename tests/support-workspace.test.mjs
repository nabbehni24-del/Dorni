import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const sql = read('supabase/sql/support_workspace.sql');
test('support permission boundary excludes broad internal data and validates live sessions', () => {
  assert.match(sql, /i\.role_code<>'SUPPORT'/);
  assert.match(sql, /p\.account_status='ACTIVE'/);
  assert.match(sql, /s\.not_after>now\(\)/);
  assert.match(sql, /t\.assigned_to=i\.user_id/);
  assert.match(sql, /USE_SUPPORT_WORKSPACE/);
});
test('staff creation is admin-only and cannot overwrite privileged roles', () => {
  assert.match(sql, /role_code='SUPER_ADMIN'\) then raise exception 'FORBIDDEN'/);
  assert.match(sql, /existing_role<>'SUPPORT'/);
  assert.match(sql, /email_confirmed_at is not null/);
  assert.match(sql, /SUPPORT_STAFF_SAVE/);
});
test('writes are scoped, audited, concurrency-checked and duplicate replies are prevented', () => {
  for (const permission of ['status', 'assign']) assert.ok(sql.includes(`private.support_allowed('${permission}',tid)`));
  assert.match(sql, /case when internal then 'notes' else 'reply'/);
  assert.match(sql, /is distinct from old_time/);
  assert.match(sql, /client_request_id=request_id/);
  assert.match(sql, /revoke insert,update,delete on public.support_tickets,public.support_messages/);
});
test('new APIs enforce authentication, strict validation and same-origin mutations', () => {
  for (const file of ['app/api/support/workspace/route.ts', 'app/api/admin/support-staff/route.ts']) {
    const source = read(file);
    assert.match(source, /requireInternal/);
    assert.match(source, /validPushOrigin/);
    assert.match(source, /\.parse\(await request.json\(\)\)/);
    assert.doesNotMatch(source, /createAdminSupabase|SERVICE_ROLE/);
  }
});
test('support live updates are permission-filtered and cleaned up', () => {
  const source = read('components/use-support-live.ts');
  assert.match(source, /removeChannel/);
  assert.match(source, /clearInterval/);
  assert.match(source, /visibilityState/);
  assert.match(sql, /private.support_allowed\(case when is_internal then 'notes' else 'view'/);
});
