import { json, requireUser, UnauthorizedError } from "@/lib/server/http";

export async function GET() {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase
      .from("reports")
      .select("id,report_type_code,status,owner_response,duplicate_count,created_at,updated_at,vehicles(manufacturer,model,color)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return json({ reports: data ?? [] });
  } catch (error) {
    return json(
      { error: error instanceof UnauthorizedError ? "UNAUTHORIZED" : "تعذر تحديث التنبيهات" },
      error instanceof UnauthorizedError ? 401 : 500,
    );
  }
}
