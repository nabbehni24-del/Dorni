import { db, json, secretHash } from "@/lib/server/core";
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const row = await db().prepare("SELECT report_type, status, owner_response, created_at, updated_at, expires_at FROM reports WHERE status_token_hash = ?").bind(await secretHash(token)).first<{ report_type: string; status: string; owner_response: string | null; created_at: number; updated_at: number; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return json({ error: "رابط الحالة منتهي أو غير صالح" }, 404);
  return json({ reportType: row.report_type, status: row.status, ownerResponse: row.owner_response, createdAt: row.created_at, updatedAt: row.updated_at });
}
