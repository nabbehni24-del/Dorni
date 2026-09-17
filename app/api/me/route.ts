import { AuthError, requireUser } from "@/lib/server/auth";
import { db, json } from "@/lib/server/core";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const [vehicles, reports] = await Promise.all([
      db().prepare(`SELECT v.id, v.manufacturer, v.model, v.color, v.year, c.serial_number, c.public_token, c.activation_state FROM vehicles v LEFT JOIN codes c ON c.vehicle_id = v.id AND c.activation_state = 'ACTIVE' WHERE v.user_id = ? ORDER BY v.created_at DESC`).bind(user.id).all(),
      db().prepare(`SELECT r.id, r.report_type, r.status, r.owner_response, r.created_at, v.manufacturer, v.model, v.color FROM reports r JOIN vehicles v ON v.id = r.vehicle_id WHERE v.user_id = ? ORDER BY r.created_at DESC LIMIT 30`).bind(user.id).all(),
    ]);
    return json({ user, vehicles: vehicles.results, reports: reports.results });
  } catch (error) { return json({ error: error instanceof AuthError ? "UNAUTHORIZED" : "تعذر تحميل الحساب" }, error instanceof AuthError ? 401 : 500); }
}
