import {z} from "zod";
import {body,json,requireUser,UnauthorizedError} from "@/lib/server/http";
import {validPushOrigin} from "@/lib/server/push-origin";

const schema=z.object({organizationId:z.string().uuid(),publicToken:z.string().min(20).max(200),reasonCode:z.enum(["BLOCKING_ACCESS","OBSTRUCTING_TRAFFIC","SAFETY_REASON","OTHER"]),reasonNote:z.string().trim().max(240).optional(),idempotencyKey:z.string().min(16).max(120)}).superRefine((v,ctx)=>{if(v.reasonCode==="OTHER"&&(!v.reasonNote||v.reasonNote.length<3))ctx.addIssue({code:z.ZodIssueCode.custom,path:["reasonNote"],message:"اكتب سبباً مختصراً"});});

export async function POST(request:Request){
  try{
    if(!validPushOrigin(request,process.env.NEXT_PUBLIC_APP_URL))return json({error:"عنوان الطلب غير مسموح"},403);
    const value=schema.parse(await body(request));
    const {supabase}=await requireUser();
    const {data,error}=await supabase.rpc("create_institutional_move_request",{p_organization_id:value.organizationId,p_public_token:value.publicToken,p_reason_code:value.reasonCode,p_reason_note:value.reasonNote??null,p_idempotency_key:value.idempotencyKey});
    if(error){const forbidden=error.message.includes("FORBIDDEN");const limited=error.message.includes("RATE_LIMITED")||error.message.includes("DUPLICATE");return json({error:forbidden?"ما عندكش صلاحية لإرسال هذا الإجراء":limited?"تم إرسال طلب قريباً؛ انتظر قبل إعادة المحاولة":"تعذر إنشاء الطلب المؤسسي"},forbidden?403:400);}
    return json({action:data},201);
  }catch(error){if(error instanceof UnauthorizedError)return json({error:"UNAUTHORIZED"},401);if(error instanceof z.ZodError)return json({error:error.issues[0]?.message??"بيانات الطلب غير صالحة"},400);return json({error:"تعذر إنشاء الطلب المؤسسي"},500);}
}
