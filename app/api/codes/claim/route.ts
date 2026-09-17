import { z } from "zod";
import { body, json, requireUser, UnauthorizedError } from "@/lib/server/http";
import { claimDigest } from "@/lib/server/security";
const schema=z.object({serialNumber:z.string().trim().min(6).max(80),claimCode:z.string().trim().min(8).max(120),vehicleId:z.string().uuid()});
export async function POST(request:Request){try{const {supabase}=await requireUser();const p=schema.parse(await body(request));const {data,error}=await supabase.rpc("claim_dorni_code",{p_serial_number:p.serialNumber,p_credential_hash:await claimDigest(p.serialNumber,p.claimCode),p_vehicle_id:p.vehicleId});if(error)return json({error:error.message.includes("INVALID_CLAIM")?"بيانات المطالبة غير صحيحة":"تعذر تفعيل البطاقة"},400);return json({assignmentId:data},201);}catch(error){if(error instanceof UnauthorizedError)return json({error:"UNAUTHORIZED"},401);if(error instanceof z.ZodError)return json({error:"بيانات المطالبة غير صالحة"},400);return json({error:"تعذر تفعيل البطاقة"},500);}}
