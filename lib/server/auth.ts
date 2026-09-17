import { db, secretHash } from "./core";
const COOKIE = "dorni_session";
function cookieValue(request: Request, name: string) { const header = request.headers.get("cookie") ?? ""; for (const part of header.split(";")) { const [key, ...rest] = part.trim().split("="); if (key === name) return decodeURIComponent(rest.join("=")); } return null; }
export async function currentUser(request: Request) { const token = cookieValue(request, COOKIE); if (!token) return null; const tokenHash = await secretHash(token); return db().prepare(`SELECT u.id, u.phone FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`).bind(tokenHash, Date.now()).first<{ id: string; phone: string }>(); }
export async function requireUser(request: Request) { const user = await currentUser(request); if (!user) throw new AuthError(); return user; }
function secureFlag() { return process.env.NODE_ENV === "production" ? "; Secure" : ""; }
export function sessionCookie(token: string, maxAge = 60 * 60 * 24 * 30) { return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly${secureFlag()}; SameSite=Lax; Max-Age=${maxAge}`; }
export function clearSessionCookie() { return `${COOKIE}=; Path=/; HttpOnly${secureFlag()}; SameSite=Lax; Max-Age=0`; }
export class AuthError extends Error {}
