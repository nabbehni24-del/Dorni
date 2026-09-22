import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/sql/owner_workspace.sql');
test('workspace verifies session and owns vehicle/card mutations in the database',()=>{assert.match(sql,/auth\.sessions where id=sid and user_id=u/);assert.match(sql,/where id=vid and owner_id=u for update/);assert.match(sql,/CARD_ASSIGNED/);assert.match(sql,/owner_paused/);assert.match(sql,/revoke update,delete on public\.vehicles/);});
test('support links are owner checked and private notes are filtered',()=>{assert.match(sql,/a\.code_id=cid and v\.owner_id=u/);assert.match(sql,/r\.id=rid and v\.owner_id=u/);assert.match(sql,/not is_internal or staff/);assert.match(sql,/TICKET_CLOSED/);assert.match(sql,/revoke insert,update,delete on public\.support_tickets/);});
test('deletion is honestly a confirmed review request, not fake account deletion',()=>{assert.match(sql,/REQUEST_DELETE/);assert.doesNotMatch(sql,/delete from auth\.users/i);assert.match(read('components/owner-center.tsx'),/ولا يحذف أو يعطّل الحساب تلقائياً/);});
test('new menu keeps existing push implementation and does not mutate push records',()=>{assert.match(read('components/owner-center.tsx'),/<PushSettings\/>/);assert.doesNotMatch(sql,/(update|delete from|alter table) private\.push_/i);assert.doesNotMatch(sql,/notification_preferences/);});
test('logout others is scoped and requires explicit confirmation',()=>{const s=read('app/api/owner/sessions/route.ts');assert.match(s,/LOGOUT_OTHERS/);assert.match(s,/scope:'others'/);assert.match(s,/validPushOrigin/);});

