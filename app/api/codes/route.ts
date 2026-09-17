import { AuthError, requireUser } from "@/lib/server/auth";
import { audit, db, id, json, randomToken, readJson } from "@/lib/server/core";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request); const { vehicleId } = await readJson<{ vehicleId?: string }>(request);
    const vehicle = await db().prepare("SELECT id FROM vehicles WHERE id = ? AND user_id = ?").bind(vehicleId, user.id).first<{ id: string }>();
    if (!vehicle) return json({ error: "السيارة غير موجودة" }, 404);
    const existing = await db().prepare("SELECT serial_number, public_token FROM codes WHERE vehicle_id = ? AND activation_state = 'ACTIVE'").bind(vehicle.id).first();
    if (existing) return json({ error: "السيارة عندها كود مفعّل بالفعل", code: existing }, 409);
    const code = { id: id("cod"), serialNumber: `DRN-LY-${Date.now().toString(36).toUpperCase()}-${randomToken(4).toUpperCase()}`, publicToken: randomToken(18) };
    await db().prepare("INSERT INTO codes (id, serial_number, public_token, user_id, vehicle_id, activation_state, created_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)").bind(code.id, code.serialNumber, code.publicToken, user.id, vehicle.id, Date.now()).run();
    await audit(user.id, "CODE_ISSUED", "code", code.id);
    return json({ code: { ...code, publicPath: `/t/${code.publicToken}` } }, 201);
  } catch (error) { return json({ error: error instanceof AuthError ? "UNAUTHORIZED" : "تعذر إصدار الكود" }, error instanceof AuthError ? 401 : 500); }
}
