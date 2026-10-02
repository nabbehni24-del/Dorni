import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(path,imports={}){const out={};new Function('require','exports',ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(n=>imports[n],out);return out;}
const origin=load('lib/server/push-origin.ts');
const {allowedMutationOrigin:allowed}=load('lib/server/request-origin.ts',{'./push-origin':origin});
const url='https://dorni-staging-verification.onrender.com';
test('reject cross-site simple POST and opaque origins before authentication',()=>{
 for(const value of ['https://attacker.example.invalid','null'])assert.equal(allowed(new Request(url+'/api/auth/login',{method:'POST',headers:{origin:value,'content-type':'text/plain'},body:'{}'}),url),false);
 assert.equal(allowed(new Request(url+'/api/auth/logout',{method:'POST',headers:{'sec-fetch-site':'cross-site'}}),url),false);
});
test('allow same-origin mutation and non-browser authenticated callers without trusting forwarded host',()=>{
 assert.equal(allowed(new Request(url,{method:'POST',headers:{origin:url,'x-forwarded-host':'attacker.example.invalid'}}),url),true);
 assert.equal(allowed(new Request(url,{method:'POST',headers:{origin:'https://attacker.example.invalid','x-forwarded-host':'attacker.example.invalid'}}),url),false);
 assert.equal(allowed(new Request(url,{method:'POST'}),url),true);
 assert.equal(allowed(new Request(url+'/auth/callback',{headers:{'sec-fetch-site':'cross-site'}}),url),true);
});
