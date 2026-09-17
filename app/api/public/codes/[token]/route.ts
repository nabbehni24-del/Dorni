import { json } from "@/lib/server/http";
import { createAdminSupabase } from "@/lib/supabase/admin";
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){const {token}=await params;const {data,error}=await createAdminSupabase().rpc("get_public_code",{p_public_token:token});if(error||!data?.[0])return json({error:"الكود غير صالح أو غير مفعّل"},404);const row=data[0];return json({vehicle:{manufacturer:row.manufacturer,model:row.model,color:row.color}});}
