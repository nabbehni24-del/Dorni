import { z } from "zod";
import { body,json,UnauthorizedError } from "@/lib/server/http";
import { ForbiddenError,requireInternal } from "@/lib/server/access";

const schema=z.object({status:z.enum(["APPROVED","REJECTED"]),note:z.string().trim().max(1000).optional()});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const requestId=z.string().uuid().parse(id);
    const values=schema.parse(await body(request));
    const {supabase}=await requireInternal(["SUPER_ADMIN"]);
    const {data,error}=await supabase.rpc("admin_review_batch_request",{
      p_request_id:requestId,
      p_status:values.status,
      p_note:values.note??null
    });
    if(error)throw error;
    return json({request:data});
  }catch(error){
    if(error instanceof UnauthorizedError)return json({error:"UNAUTHORIZED"},401);
    if(error instanceof ForbiddenError)return json({error:"FORBIDDEN"},403);
    if(error instanceof z.ZodError)return json({error:"بيانات القرار غير صالحة"},400);
    console.error("Batch request review failed",error);
    return json({error:"تعذر حفظ قرار الطلب"},500);
  }
}

