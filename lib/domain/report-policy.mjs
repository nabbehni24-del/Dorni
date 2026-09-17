import { createHmac, randomBytes } from "node:crypto";

export const REPORT_REASONS = Object.freeze([
  "BLOCKING_EXIT", "PLEASE_MOVE", "LIGHTS_ON", "DOOR_OR_WINDOW_OPEN", "VEHICLE_DAMAGE", "URGENT_ATTENTION",
]);

export function createStatusCapability({ now = Date.now(), ttlMs = 72 * 60 * 60 * 1000, pepper }) {
  if (!pepper || Buffer.byteLength(pepper) < 32) throw new Error("status pepper must be at least 32 bytes");
  const token = randomBytes(24).toString("base64url");
  return { token, digest: createHmac("sha256", pepper).update(token).digest("hex"), expiresAt: new Date(now + ttlMs) };
}

export function duplicateKey({ codeId, reason, scannerSignal, timeBucket, pepper }) {
  if (!REPORT_REASONS.includes(reason)) throw new Error("unsupported report reason");
  return createHmac("sha256", pepper).update(`${codeId}|${reason}|${scannerSignal}|${timeBucket}`).digest("hex");
}

export function publicStatusDto(report) {
  const allowed = new Set(["CREATED", "ACTIVE", "ACKNOWLEDGED", "RESOLVED", "EXPIRED"]);
  return {
    status: allowed.has(report.status) ? report.status : "CREATED",
    reason: report.reason,
    aggregateCount: Math.max(1, Number(report.aggregateCount) || 1),
    updatedAt: report.updatedAt,
  };
}
