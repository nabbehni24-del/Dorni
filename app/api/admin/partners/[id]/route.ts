import { z } from "zod";
import { body,json,UnauthorizedError } from "@/lib/server/http";
import { ForbiddenError,requireInternal } from "@/lib/server/access";

const schema=z.object({
  status:z.enum(["ACTIVE","SUSPENDED","REJECTED"]),
  trustedGeneration:z.boolean().default(false),
  generationLimit:z.number().int().min(1).max(100000).default(100),
  note:z.string().trim().max(1000).optional()
});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const organizationId=z.string().uuid().parse(id);
    const values=schema.parse(await body(request));
    const {supabase}=await requireInternal(["SUPER_ADMIN"]);
    const {data,error}=await supabase.rpc("admin_set_partner_status",{
      p_organization_id:organizationId,
      p_status:values.status,
      p_trusted_generation:values.trustedGeneration,
      p_generation_limit:values.generationLimit,
      p_note:values.note??null
    });
    if(error)throw error;
    return json({organization:data});
  }catch(error){
    if(error instanceof UnauthorizedError)return json({error:"UNAUTHORIZED"},401);
    if(error instanceof ForbiddenError)return json({error:"FORBIDDEN"},403);
    if(error instanceof z.ZodError)return json({error:"بيانات القرار غير صالحة"},400);
    console.error("Partner review failed",error);
    return json({error:"تعذر حفظ قرار الشركة"},500);
  }
}

