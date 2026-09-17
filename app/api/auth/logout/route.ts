import { clearSessionCookie } from "@/lib/server/auth";
import { json } from "@/lib/server/core";
export async function POST() { return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() }); }
