import { json,UnauthorizedError } from "@/lib/server/http";
import { ForbiddenError,requireInternal } from "@/lib/server/access";
export async function GET(){try{const {supabase}=await requireInternal();const {data,error}=await supabase.rpc("get_admin_overview");if(error)throw error;return json(data);}catch(error){if(error instanceof UnauthorizedError)return json({error:"UNAUTHORIZED"},401);if(error instanceof ForbiddenError)return json({error:"FORBIDDEN"},403);return json({error:"تعذر تحميل لوحة العمليات"},500);}}
