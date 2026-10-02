import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './load-ts.mjs';
const {standardBalance,cardStatus}=await import(moduleUrl('lib/code-inventory.ts'));
test('empty inventory means zero commercial credit, never inferred from old issuance',()=>{
 assert.equal(standardBalance({balances:[],legacyIssued:10000,canIssue:true}).remaining,0);
 assert.equal(standardBalance({balances:[{product_type:'OTHER',remaining:200}]}).remaining,0);
});
test('inventory preserves 200 granted / 73 issued / 127 remaining',()=>{
 assert.deepEqual(standardBalance({balances:[{product_type:'STANDARD_CARD',granted:200,issued:73,remaining:127,revoked:0}]}),{product_type:'STANDARD_CARD',granted:200,issued:73,remaining:127,revoked:0});
});
test('card display never equates claimed ownership with active service',()=>{
 const active={card_state:'VALID',admin_suspended:false,owner_paused:false,service_state:'ENABLED'};
 assert.equal(cardStatus(active),'الخدمة فعّالة');
 assert.equal(cardStatus({...active,admin_suspended:true,owner_paused:true}),'معلّقة إداريًا');
 assert.equal(cardStatus({...active,owner_paused:true}),'موقوفة من المالك');
 assert.equal(cardStatus({...active,card_state:'REVOKED'}),'بطاقة ملغاة');
 assert.equal(cardStatus({...active,service_state:'NOT_STARTED'}),'بانتظار التفعيل');
});
