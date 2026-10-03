import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const out={};
new Function('exports',ts.transpileModule(readFileSync(new URL('../lib/login-error.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(out);
test('unconfirmed email is not presented as a wrong password',()=>{
 const r=out.loginFailure({code:'email_not_confirmed',status:400});
 assert.equal(r.status,403);assert.match(r.error,/أكد بريدك/);assert.doesNotMatch(r.error,/غير صحيحة/);
});
test('credential, throttle and service failures stay distinct without leaking provider text',()=>{
 assert.equal(out.loginFailure({code:'invalid_credentials',status:400}).status,401);
 assert.equal(out.loginFailure({status:429}).status,429);
 assert.equal(out.loginFailure({code:'unexpected_failure',status:500}).status,503);
 assert.equal(out.loginFailure({}).status,503);
});
