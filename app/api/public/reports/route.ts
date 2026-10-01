import { z } from "zod";
import { body, json } from "@/lib/server/http";
import { digest, randomToken } from "@/lib/server/security";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { validPushOrigin } from "@/lib/server/push-origin";
const schema=z.object({publicToken:z.string().min(20).max(200),reportType:z.enum(["BLOCKING_EXIT","PLEASE_MOVE","LIGHTS_ON","DOOR_OR_WINDOW_OPEN","VEHICLE_DAMAGE","URGENT_ATTENTION"]),statusToken:z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),scannerSessionToken:z.string().min(20).max(200).optional(),latitude:z.number().min(-90).max(90).optional(),longitude:z.number().min(-180).max(180).optional()}).strict();
export async function POST(request:Request){
  if(!validPushOrigin(request,process.env.NEXT_PUBLIC_APP_URL)) return json({error:"عنوان الطلب غير مسموح"},403);
  try{
    const p=schema.parse(await body(request));
    const statusToken=p.statusToken??randomToken(32);
    const sessionToken=p.scannerSessionToken??randomToken(24);
    const ip=(request.headers.get("x-forwarded-for")??"").split(",")[0].trim();
    const {data,error}=await createAdminSupabase().rpc("submit_public_report",{p_public_token:p.publicToken,p_report_type:p.reportType,p_session_hash:await digest(sessionToken),p_status_token_hash:await digest(statusToken),p_ip_hash:ip?await digest(`${process.env.ABUSE_HASH_SECRET??"dev"}:${ip}`):null,p_latitude:p.latitude??null,p_longitude:p.longitude??null});
    if(error){
      if(error.message.includes("REQUEST_EXPIRED")||error.message.includes("REQUEST_CONFLICT")) return json({error:"تعذر استكمال المحاولة السابقة. ابدأ بلاغاً جديداً.",code:"NEW_ATTEMPT_REQUIRED"},409);
      if(error.message.includes("CODE_NOT_ACTIVE")) return json({error:"البطاقة غير متاحة لاستقبال البلاغات حالياً."},409);
      return json({error:"تعذر تأكيد إرسال البلاغ. يمكنك إعادة المحاولة بأمان."},503);
    }
    if(!data?.[0]?.report_id) return json({error:"لم يصل تأكيد الإرسال. أعد المحاولة."},503);
    return json({reportId:data[0].report_id,aggregated:data[0].aggregated,statusToken,statusPath:`/status/${statusToken}`,scannerSessionToken:sessionToken},201);
  }catch(error){return json({error:error instanceof z.ZodError?"بيانات البلاغ غير صالحة":"تعذر تأكيد الإرسال. تحقق من الاتصال وحاول مجدداً."},error instanceof z.ZodError?400:503);}
}
