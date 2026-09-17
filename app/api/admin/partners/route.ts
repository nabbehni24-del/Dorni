import { z } from "zod";
import { body,json,UnauthorizedError } from "@/lib/server/http";
import { ForbiddenError,requireInternal } from "@/lib/server/access";
import { normalizeLibyanPhone } from "@/lib/server/security";
const schema=z.object({name:z.string().trim().min(2).max(160),type:z.enum(["INSURANCE","CORPORATE","DISTRIBUTOR","OTHER"]),adminPhone:z.string().min(9).optional()});
export async function POST(request:Request){try{const {supabase}=await requireInternal(["SUPER_ADMIN","OPERATIONS","PARTNER_MANAGER"]);const p=schema.parse(await body(request));const {data,error}=await supabase.rpc("create_partner_organization",{p_name:p.name,p_type:p.type,p_admin_phone:p.adminPhone?normalizeLibyanPhone(p.adminPhone):null});if(error)throw error;return json(data,201);}catch(error){if(error instanceof UnauthorizedError)return json({error:"UNAUTHORIZED"},401);if(error instanceof ForbiddenError)return json({error:"FORBIDDEN"},403);if(error instanceof z.ZodError)return json({error:"بيانات الشريك غير صالحة"},400);return json({error:"تعذر إنشاء الشريك"},500);}}
