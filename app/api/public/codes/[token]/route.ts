import { db, json } from "@/lib/server/core";
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const row = await db().prepare(`SELECT v.manufacturer, v.model, v.color FROM codes c JOIN vehicles v ON v.id = c.vehicle_id WHERE c.public_token = ? AND c.activation_state = 'ACTIVE'`).bind(token).first();
  return row ? json({ active: true, vehicle: row }) : json({ active: false }, 404);
}
