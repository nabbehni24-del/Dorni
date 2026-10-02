import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const exported={};new Function('exports',ts.transpileModule(readFileSync(new URL('../lib/activation-fragment.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exported);
test('second activation fragment restarts capture and cleanup survives strict-mode remount',()=>{
 const listeners=new Set();let reloads=0;const target={location:{hash:'',reload:()=>reloads++},addEventListener:(name,fn)=>{assert.equal(name,'hashchange');listeners.add(fn);},removeEventListener:(name,fn)=>listeners.delete(fn)};
 let cleanup=exported.watchActivationFragment(target);cleanup();assert.equal(listeners.size,0);cleanup=exported.watchActivationFragment(target);
 for(const fn of listeners)fn();assert.equal(reloads,0);
 target.location.hash='#serial=SECOND&code=PRIVATE';for(const fn of listeners)fn();assert.equal(reloads,1);
 cleanup();assert.equal(listeners.size,0);
});
