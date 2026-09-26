import {z} from "zod";
import {body,json,requireUser,UnauthorizedError} from "@/lib/server/http";
import {validPushOrigin} from "@/lib/server/push-origin";

const payload=z.object({organizationId:z.string().uuid()});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    if(!validPushOrigin(request,process.env.NEXT_PUBLIC_APP_URL))return json({error:"عنوان الطلب غير مسموح"},403);
    const {id}=await params;
    const actionId=z.string().uuid().parse(id);
    const value=payload.parse(await body(request));
    const {supabase}=await requireUser();
    const {data,error}=await supabase.rpc("complete_institutional_action",{p_organization_id:value.organizationId,p_action_id:actionId});
    if(error)return json({error:"لا يمكن إغلاق هذا الإجراء في حالته الحالية"},403);
    return json({action:data});
  }catch(error){return json({error:error instanceof UnauthorizedError?"UNAUTHORIZED":"بيانات الطلب غير صالحة"},error instanceof UnauthorizedError?401:400);}
}

