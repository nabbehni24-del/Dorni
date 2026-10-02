import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const exported={};
new Function('exports',ts.transpileModule(readFileSync(new URL('../lib/auth-callback-recovery.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exported);
test('missing PKCE verifier gives browser recovery without claiming token validity',()=>{
 assert.equal(exported.callbackErrorReason({code:'pkce_code_verifier_not_found'}),'email_browser');
 for(const value of [null,new Error('expired'),{code:'otp_expired'},{code:'flow_state_not_found'}])assert.equal(exported.callbackErrorReason(value),'email_link');
});
test('callback preserves claim destination and never transfers private proof to URL',()=>{
 const code=readFileSync(new URL('../app/auth/callback/route.ts',import.meta.url),'utf8');
 assert.match(code,/callbackErrorReason\(error\)/);
 assert.match(code,/login\.searchParams\.set\('next', '\/claim'\)/);
 assert.doesNotMatch(code,/login\.searchParams\.set\(['"](?:proof|code|serial|credential)['"]/);
});
