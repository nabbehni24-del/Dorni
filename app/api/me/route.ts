import { json, requireUser, UnauthorizedError } from "@/lib/server/http";

export async function GET() {
  try {
    const { user, supabase } = await requireUser();
    const [profile, vehicles, reports, preferences, contacts] = await Promise.all([
      supabase.from("profiles").select("id,phone,email,locale,account_status,created_at").eq("id",user.id).single(),
      supabase.from("vehicles").select("id,manufacturer,model,color,nickname,year,archived_at,code_assignments(id,ended_at,codes(id,serial_number,public_token,activation_state))").is("archived_at",null).order("created_at",{ascending:false}),
      supabase.from("reports").select("id,report_type_code,status,owner_response,duplicate_count,created_at,updated_at,vehicles(manufacturer,model,color)").order("created_at",{ascending:false}).limit(50),
      supabase.from("notification_preferences").select("*").eq("user_id",user.id).single(),
      supabase.from("contact_methods").select("id,kind,destination,verified_at,enabled").order("created_at"),
    ]);
    const error = profile.error||vehicles.error||reports.error||preferences.error||contacts.error;
    if (error) throw error;
    return json({ user:{id:user.id,phone:user.phone??null,email:user.email??null},profile:profile.data,vehicles:vehicles.data,reports:reports.data,preferences:preferences.data,contacts:contacts.data });
  } catch(error){return json({error:error instanceof UnauthorizedError?"UNAUTHORIZED":"تعذر تحميل الحساب"},error instanceof UnauthorizedError?401:500);}
}
