import { AuthError, requireUser } from "@/lib/server/auth";
import { audit, db, id, json, readJson } from "@/lib/server/core";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const p = await readJson<{ manufacturer?: string; model?: string; color?: string; year?: number }>(request);
    const manufacturer = p.manufacturer?.trim(), model = p.model?.trim(), color = p.color?.trim();
    if (!manufacturer || !model || !color) return json({ error: "بيانات السيارة الأساسية مطلوبة" }, 400);
    const vehicle = { id: id("veh"), manufacturer, model, color, year: p.year ? Number(p.year) : null };
    await db().prepare("INSERT INTO vehicles (id, user_id, manufacturer, model, color, year, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(vehicle.id, user.id, manufacturer, model, color, vehicle.year, Date.now()).run();
    await audit(user.id, "VEHICLE_CREATED", "vehicle", vehicle.id);
    return json({ vehicle }, 201);
  } catch (error) { return json({ error: error instanceof AuthError ? "UNAUTHORIZED" : "تعذر إضافة السيارة" }, error instanceof AuthError ? 401 : 500); }
}
