import { env } from "cloudflare:workers";

const encoder = new TextEncoder();
export const reportTypes = ["BLOCKING_EXIT", "PLEASE_MOVE", "LIGHTS_ON", "DOOR_OR_WINDOW_OPEN", "VEHICLE_DAMAGE", "URGENT_ATTENTION"] as const;
export const ownerResponses = ["ON_MY_WAY", "RESOLVED", "CANNOT_REACH_NOW"] as const;
export function db(): D1Database { if (!env.DB) throw new Error("Database unavailable"); return env.DB; }
export function id(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`; }
export function randomToken(bytes = 24) { const data = new Uint8Array(bytes); crypto.getRandomValues(data); return btoa(String.fromCharCode(...data)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
export async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value)); return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
export async function secretHash(value: string) { const secret = env.AUTH_SECRET; if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is not configured"); return sha256(`${secret}:${value}`); }
export function normalizePhone(value: unknown) { const digits = String(value ?? "").replace(/\D/g, ""); const normalized = digits.startsWith("218") ? `+${digits}` : digits.startsWith("0") ? `+218${digits.slice(1)}` : `+218${digits}`; if (!/^\+2189\d{8}$/.test(normalized)) throw new Error("أدخل رقم هاتف ليبي صحيح"); return normalized; }
export function json(data: unknown, status = 200, headers?: HeadersInit) { return Response.json(data, { status, headers }); }
export async function readJson<T>(request: Request): Promise<T> { if (!request.headers.get("content-type")?.includes("application/json")) throw new Error("طلب غير صالح"); return request.json() as Promise<T>; }
export function isDevelopmentOtp() { return env.OTP_MODE === "development"; }
export async function audit(actorId: string | null, action: string, entityType: string, entityId: string | null) { await db().prepare("INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id("aud"), actorId, action, entityType, entityId, Date.now()).run(); }
