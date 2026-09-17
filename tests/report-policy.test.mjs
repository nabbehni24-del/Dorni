import test from "node:test";
import assert from "node:assert/strict";
import { createStatusCapability, duplicateKey, publicStatusDto } from "../lib/domain/report-policy.mjs";

const pepper = "another-test-pepper-longer-than-thirty-two-bytes";

test("status capabilities are high entropy, hashed, scoped by caller, and expiring", () => {
  const now = Date.UTC(2026, 8, 17);
  const capability = createStatusCapability({ now, pepper });
  assert.ok(capability.token.length >= 32);
  assert.notEqual(capability.token, capability.digest);
  assert.equal(capability.expiresAt.getTime(), now + 72 * 60 * 60 * 1000);
});

test("duplicate keys are stable only inside the same policy bucket", () => {
  const base = { codeId: "code-1", reason: "BLOCKING_EXIT", scannerSignal: "rotating-signal", timeBucket: "2026-09-17T17:40", pepper };
  assert.equal(duplicateKey(base), duplicateKey(base));
  assert.notEqual(duplicateKey(base), duplicateKey({ ...base, timeBucket: "2026-09-17T17:41" }));
});

test("public report status omits internal and personal fields", () => {
  const dto = publicStatusDto({ status: "ACKNOWLEDGED", reason: "PLEASE_MOVE", aggregateCount: 4, updatedAt: "2026-09-17T17:00:00Z", ownerPhone: "+218...", abuseScore: 71 });
  assert.deepEqual(Object.keys(dto).sort(), ["aggregateCount", "reason", "status", "updatedAt"]);
});
