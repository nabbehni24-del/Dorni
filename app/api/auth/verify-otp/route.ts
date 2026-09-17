import { db, id, json, randomToken, readJson, secretHash } from "@/lib/server/core";
import { sessionCookie } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const { challengeId, code } = await readJson<{ challengeId?: string; code?: string }>(request);
    const challenge = await db().prepare("SELECT id, phone, code_hash, attempts, expires_at, consumed_at FROM otp_challenges WHERE id = ?").bind(challengeId).first<{ id: string; phone: string; code_hash: string; attempts: number; expires_at: number; consumed_at: number | null }>();
    if (!challenge || challenge.consumed_at || challenge.expires_at < Date.now() || challenge.attempts >= 5) return json({ error: "الرمز منتهي أو غير صالح" }, 400);
    const candidate = await secretHash(`${challenge.id}:${String(code ?? "")}`);
    if (candidate !== challenge.code_hash) { await db().prepare("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?").bind(challenge.id).run(); return json({ error: "الرمز غير صحيح" }, 400); }
    let user = await db().prepare("SELECT id, phone FROM users WHERE phone = ?").bind(challenge.phone).first<{ id: string; phone: string }>();
    if (!user) { user = { id: id("usr"), phone: challenge.phone }; await db().prepare("INSERT INTO users (id, phone, created_at) VALUES (?, ?, ?)").bind(user.id, user.phone, Date.now()).run(); }
    const sessionToken = randomToken(32); const tokenHash = await secretHash(sessionToken);
    await db().batch([
      db().prepare("UPDATE otp_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(Date.now(), challenge.id),
      db().prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(tokenHash, user.id, Date.now() + 30 * 24 * 60 * 60_000, Date.now()),
    ]);
    return json({ user }, 200, { "Set-Cookie": sessionCookie(sessionToken) });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "تعذر تسجيل الدخول" }, 400); }
}
