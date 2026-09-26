import {z} from "zod";
import {body,json,requireUser,UnauthorizedError} from "@/lib/server/http";
import {validPushOrigin} from "@/lib/server/push-origin";
const schema=z.object({response:z.enum(["SEEN","WILL_MOVE"])});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{if(!validPushOrigin(request,process.env.NEXT_PUBLIC_APP_URL))return json({error:"عنوان الطلب غير مسموح"},403);const {id}=await params;z.string().uuid().parse(id);const value=schema.parse(await body(request));const {supabase}=await requireUser();const {data,error}=await supabase.rpc("respond_to_institutional_action",{p_action_id:id,p_response:value.response});if(error)return json({error:error.message.includes("NOT_FOUND")?"التنبيه غير موجود":"تعذر تسجيل الرد"},400);return json({action:data});}catch(error){return json({error:error instanceof UnauthorizedError?"UNAUTHORIZED":"بيانات الرد غير صالحة"},error instanceof UnauthorizedError?401:400);}}
