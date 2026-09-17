import { json } from "@/lib/server/http";
import { createServerSupabase } from "@/lib/supabase/server";
export async function POST() { const supabase = await createServerSupabase(); await supabase.auth.signOut({ scope: "local" }); return json({ ok: true }); }
