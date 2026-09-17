import { db, id, json, randomToken, readJson, reportTypes, secretHash } from "@/lib/server/core";
export async function POST(request: Request) {
  try {
    const { publicToken, reportType } = await readJson<{ publicToken?: string; reportType?: string }>(request);
    if (!reportTypes.includes(reportType as never)) return json({ error: "نوع البلاغ غير صالح" }, 400);
    const code = await db().prepare("SELECT id, vehicle_id FROM codes WHERE public_token = ? AND activation_state = 'ACTIVE'").bind(publicToken).first<{ id: string; vehicle_id: string }>();
    if (!code) return json({ error: "الكود غير مفعّل" }, 404);
    const recent = await db().prepare("SELECT id FROM reports WHERE code_id = ? AND report_type = ? AND status IN ('ACTIVE','ACKNOWLEDGED') AND created_at > ?").bind(code.id, reportType, Date.now() - 5 * 60_000).first();
    if (recent) return json({ error: "تم إرسال نفس التنبيه مؤخراً" }, 429);
    const statusToken = randomToken(24), reportId = id("rpt"), now = Date.now();
    await db().batch([
      db().prepare("INSERT INTO reports (id, code_id, vehicle_id, report_type, status, status_token_hash, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)").bind(reportId, code.id, code.vehicle_id, reportType, await secretHash(statusToken), now + 72 * 60 * 60_000, now, now),
      db().prepare("INSERT INTO report_events (id, report_id, event_type, created_at) VALUES (?, ?, 'REPORT_CREATED', ?)").bind(id("evt"), reportId, now),
    ]);
    return json({ reportId, statusToken, statusPath: `/status/${statusToken}` }, 201);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "تعذر إرسال البلاغ" }, 400); }
}
