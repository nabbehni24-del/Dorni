import "server-only";

function toHex(bytes: Uint8Array) { return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""); }
export function randomToken(bytes = 24) { const value = new Uint8Array(bytes); crypto.getRandomValues(value); return Buffer.from(value).toString("base64url"); }
export async function digest(value: string) { return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
export async function claimDigest(serial: string, claimCode: string) {
  const pepper = process.env.CLAIM_PEPPER;
  if (!pepper) throw new Error("CLAIM_PEPPER is missing");
  return digest(`${pepper}:${serial.trim().toUpperCase()}:${claimCode.replace(/\s|-/g, "").toUpperCase()}`);
}
export function normalizeLibyanPhone(input: string) {
  const digits = input.replace(/\D/g, "");
  if (/^2189\d{8}$/.test(digits)) return `+${digits}`;
  if (/^09\d{8}$/.test(digits)) return `+218${digits.slice(1)}`;
  if (/^9\d{8}$/.test(digits)) return `+218${digits}`;
  throw new Error("رقم الهاتف الليبي غير صالح");
}
