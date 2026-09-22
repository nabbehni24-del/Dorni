import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../lib/server/push-origin.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { validPushOrigin } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
test('public Dorni origin is accepted behind an internal Render URL', () => {
  const req = new Request('http://localhost:10000/api/push', {headers:{origin:'https://dorni.onrender.com'}});
  assert.equal(validPushOrigin(req, 'https://dorni.onrender.com'), true);
});
test('foreign, opaque and spoofed forwarded origins remain rejected', () => {
  for(const origin of ['https://evil.example', 'null', 'http://dorni.onrender.com']) {
    const req = new Request('http://localhost:10000/api/push', {headers:{origin,'x-forwarded-host':'evil.example'}});
    assert.equal(validPushOrigin(req, 'https://dorni.onrender.com'), false);
  }
});

