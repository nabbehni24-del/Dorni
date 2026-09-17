import { z } from "zod";
import { body, json, requireUser, UnauthorizedError } from "@/lib/server/http";
const schema=z.object({response:z.enum(["ON_MY_WAY","RESOLVED","CANNOT_REACH_NOW"])});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const {supabase}=await requireUser();const {response}=schema.parse(await body(request));const {error}=await supabase.rpc("respond_to_report",{p_report_id:id,p_response:response});if(error)throw error;return json({ok:true,response});}catch(error){if(error instanceof UnauthorizedError)return json({error:"UNAUTHORIZED"},401);if(error instanceof z.ZodError)return json({error:"رد غير صالح"},400);return json({error:"تعذر تحديث البلاغ"},400);}}
