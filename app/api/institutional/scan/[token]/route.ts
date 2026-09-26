import {json,requireUser,UnauthorizedError} from "@/lib/server/http";
import {z} from "zod";

export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const {token}=await params;
    const organizationId=new URL(request.url).searchParams.get("organizationId");
    if(organizationId&&!z.string().uuid().safeParse(organizationId).success)return json({error:"INVALID_ORGANIZATION"},400);
    const {supabase}=await requireUser();
    const {data,error}=await supabase.rpc("get_institutional_scan_context",{p_public_token:token,p_organization_id:organizationId||null});
    if(error)throw error;
    return json(data);
  }catch(error){
    if(error instanceof UnauthorizedError)return json({authenticated:false,availableActions:[]},200);
    console.error("Institutional scan context failed",error);
    return json({error:"تعذر التحقق من الصلاحية المؤسسية"},400);
  }
}
