import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("company portal separates operational responsibilities into real sections",async()=>{
  const [page,model]=await Promise.all([read("app/partner/page.tsx"),read("lib/company-portal.ts")]);
  for(const section of ["overview","codes","production","operations","team","roles","reports"]){
    assert.match(model,new RegExp(`\\| \\\"${section}\\\"|${section}:`));
  }
  assert.match(page,/company-sidebar/);
  assert.match(page,/InstitutionalWorkspace/);
  assert.doesNotMatch(page,/institutional-shortcut/);
});

test("institutional sections stay capability-aware and preserve live refresh",async()=>{
  const workspace=await read("components/institutional-workspace.tsx");
  assert.match(workspace,/onCapabilities/);
  assert.match(workspace,/capabilities\.actions/);
  assert.match(workspace,/capabilities\.members/);
  assert.match(workspace,/capabilities\.roles/);
  assert.match(workspace,/capabilities\.audit/);
  assert.match(workspace,/setInterval\(\(\)=>void load\(true\),15000\)/);
});

test("legacy institutional URL redirects into the unified operations console",async()=>{
  const legacy=await read("app/partner/institutional/page.tsx");
  assert.match(legacy,/redirect\("\/partner\?section=operations"\)/);
});
