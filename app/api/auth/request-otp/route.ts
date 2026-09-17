import { db, id, isDevelopmentOtp, json, normalizePhone, readJson, secretHash } from "@/lib/server/core";

export async function POST(request: Request) {
  try {
    const { phone } = await readJson<{ phone?: string }>(request);
    const normalized = normalizePhone(phone);
    const recent = await db().prepare("SELECT created_at FROM otp_challenges WHERE phone = ? ORDER BY created_at DESC LIMIT 1").bind(normalized).first<{ created_at: number }>();
    if (recent && Date.now() - recent.created_at < 60_000) return json({ error: "استنى دقيقة قبل طلب رمز جديد" }, 429);
    const challengeId = id("otp");
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await db().prepare("INSERT INTO otp_challenges (id, phone, code_hash, attempts, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)")
      .bind(challengeId, normalized, await secretHash(`${challengeId}:${code}`), Date.now() + 5 * 60_000, Date.now()).run();
    if (!isDevelopmentOtp()) return json({ error: "مزوّد الرسائل غير مهيأ بعد" }, 503);
    return json({ challengeId, phone: normalized, developmentCode: code, expiresInSeconds: 300 });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "تعذر إرسال الرمز" }, 400); }
}
