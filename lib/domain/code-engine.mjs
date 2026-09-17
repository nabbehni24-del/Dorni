import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PUBLIC_TOKEN_BYTES = 18;
const CLAIM_SECRET_BYTES = 20;

function base64url(bytes) {
  return bytes.toString("base64url");
}

export function normalizeClaimCredential(value) {
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function claimDigest(credential, pepper) {
  if (!pepper || Buffer.byteLength(pepper) < 32) throw new Error("claim pepper must be at least 32 bytes");
  return createHmac("sha256", pepper).update(normalizeClaimCredential(credential)).digest("hex");
}

export function verifyClaimCredential(credential, expectedDigest, pepper) {
  const candidate = Buffer.from(claimDigest(credential, pepper), "hex");
  const expected = Buffer.from(expectedDigest, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function issueCode({ batchCode, sequence, pepper, origin = "https://dorni.ly" }) {
  if (!batchCode || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error("invalid issuance input");
  const publicToken = base64url(randomBytes(PUBLIC_TOKEN_BYTES));
  const rawClaim = base64url(randomBytes(CLAIM_SECRET_BYTES)).toUpperCase();
  const groupedClaim = rawClaim.match(/.{1,5}/g).join("-");
  const serialSuffix = randomBytes(4).toString("hex").toUpperCase();
  const serialNumber = `DRN-${batchCode}-${String(sequence).padStart(6, "0")}-${serialSuffix}`;
  return {
    publicRecord: {
      serialNumber,
      publicToken,
      publicUrl: `${origin.replace(/\/$/, "")}/t/${publicToken}`,
      productionState: "PROVISIONED",
      claimState: "UNCLAIMED",
      activationState: "INACTIVE",
    },
    secretProductionRecord: {
      serialNumber,
      claimCredential: groupedClaim,
      claimDigest: claimDigest(groupedClaim, pepper),
    },
  };
}

export function issueBatch({ batchCode, quantity, pepper, origin }) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000) throw new Error("quantity out of policy");
  return Array.from({ length: quantity }, (_, index) => issueCode({ batchCode, sequence: index + 1, pepper, origin }));
}

export function toPublicCodeDto(code, vehicle) {
  if (code.activationState !== "ACTIVE") return { active: false };
  return {
    active: true,
    vehicle: { manufacturer: vehicle.manufacturer, model: vehicle.model, color: vehicle.color },
  };
}
