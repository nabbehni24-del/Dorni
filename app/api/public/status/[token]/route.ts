import { json } from "@/lib/server/http";
import { digest } from "@/lib/server/security";
import { createAdminSupabase } from "@/lib/supabase/admin";
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){const {token}=await params;const {data,error}=await createAdminSupabase().rpc("get_public_report_status",{p_status_token_hash:await digest(token)});if(error||!data?.[0])return json({error:"رابط الحالة منتهي أو غير صالح"},404);const r=data[0];return json({reportType:r.report_type_code,status:r.status,ownerResponse:r.owner_response,createdAt:r.created_at,updatedAt:r.updated_at,expiresAt:r.expires_at});}
