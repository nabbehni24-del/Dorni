import {z} from "zod";
import {body,json,UnauthorizedError} from "@/lib/server/http";
import {ForbiddenError,requireInternal} from "@/lib/server/access";
const permission=z.enum(["ORG_MEMBER_VIEW","ORG_MEMBER_INVITE","ORG_MEMBER_SUSPEND","ORG_ROLE_ASSIGN","ORG_AUDIT_VIEW","ORG_REPORT_VIEW","VEHICLE_MOVE_REQUEST"]);
const schema=z.object({enabled:z.boolean(),entitlements:z.array(permission).max(20)});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;z.string().uuid().parse(id);const value=schema.parse(await body(request));const {supabase}=await requireInternal(["SUPER_ADMIN"]);const {data,error}=await supabase.rpc("admin_set_institutional_access",{p_organization_id:id,p_enabled:value.enabled,p_entitlements:value.entitlements});if(error)throw error;return json(data);}catch(error){if(error instanceof UnauthorizedError)return json({error:"UNAUTHORIZED"},401);if(error instanceof ForbiddenError)return json({error:"FORBIDDEN"},403);return json({error:"تعذر تحديث الصلاحيات المؤسسية"},400);}}
