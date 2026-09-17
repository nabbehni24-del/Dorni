import { AuthError, requireUser } from "@/lib/server/auth";
import { audit, db, id, json, ownerResponses, readJson } from "@/lib/server/core";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request), { id: reportId } = await context.params;
    const { response } = await readJson<{ response?: string }>(request);
    if (!ownerResponses.includes(response as never)) return json({ error: "الرد غير صالح" }, 400);
    const report = await db().prepare(`SELECT r.id FROM reports r JOIN vehicles v ON v.id = r.vehicle_id WHERE r.id = ? AND v.user_id = ?`).bind(reportId, user.id).first();
    if (!report) return json({ error: "البلاغ غير موجود" }, 404);
    const status = response === "RESOLVED" ? "RESOLVED" : "ACKNOWLEDGED", now = Date.now();
    await db().batch([
      db().prepare("UPDATE reports SET owner_response = ?, status = ?, updated_at = ? WHERE id = ?").bind(response, status, now, reportId),
      db().prepare("INSERT INTO report_events (id, report_id, event_type, created_at) VALUES (?, ?, ?, ?)").bind(id("evt"), reportId, `OWNER_${response}`, now),
    ]);
    await audit(user.id, "REPORT_RESPONDED", "report", reportId);
    return json({ reportId, status, response });
  } catch (error) { return json({ error: error instanceof AuthError ? "UNAUTHORIZED" : "تعذر تحديث البلاغ" }, error instanceof AuthError ? 401 : 500); }
}
