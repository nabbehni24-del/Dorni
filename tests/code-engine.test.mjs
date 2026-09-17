import test from "node:test";
import assert from "node:assert/strict";
import { claimDigest, issueBatch, issueCode, toPublicCodeDto, verifyClaimCredential } from "../lib/domain/code-engine.mjs";

const pepper = "test-only-pepper-that-is-definitely-long-enough";

test("issued public and claim credentials are independent and verifiable", () => {
  const issued = issueCode({ batchCode: "INS-000124", sequence: 1, pepper });
  assert.notEqual(issued.publicRecord.publicToken, issued.secretProductionRecord.claimCredential);
  assert.equal(verifyClaimCredential(issued.secretProductionRecord.claimCredential, issued.secretProductionRecord.claimDigest, pepper), true);
  assert.equal(verifyClaimCredential("wrong-code", issued.secretProductionRecord.claimDigest, pepper), false);
  assert.equal(Object.hasOwn(issued.publicRecord, "claimCredential"), false);
});

test("a representative batch has unique tokens, serials, and claim digests", () => {
  const batch = issueBatch({ batchCode: "INS-000124", quantity: 2500, pepper });
  assert.equal(new Set(batch.map((x) => x.publicRecord.publicToken)).size, batch.length);
  assert.equal(new Set(batch.map((x) => x.publicRecord.serialNumber)).size, batch.length);
  assert.equal(new Set(batch.map((x) => x.secretProductionRecord.claimDigest)).size, batch.length);
});

test("public DTO is an allowlist and inactive codes reveal no vehicle", () => {
  const vehicle = { manufacturer: "Toyota", model: "Camry", color: "White", plate: "PRIVATE", ownerPhone: "+218..." };
  assert.deepEqual(toPublicCodeDto({ activationState: "INACTIVE" }, vehicle), { active: false });
  const dto = toPublicCodeDto({ activationState: "ACTIVE" }, vehicle);
  assert.deepEqual(Object.keys(dto.vehicle).sort(), ["color", "manufacturer", "model"]);
  assert.equal(JSON.stringify(dto).includes("PRIVATE"), false);
});

test("claim normalization does not weaken secret verification", () => {
  const digest = claimDigest("AB12C-DE345", pepper);
  assert.equal(verifyClaimCredential("ab12c de345", digest, pepper), true);
});
