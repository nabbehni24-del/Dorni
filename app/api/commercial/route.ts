import {z} from 'zod';
import {json,requireUser,UnauthorizedError} from '@/lib/server/http';
import {validPushOrigin} from '@/lib/server/push-origin';
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('grant'),organizationId:z.string().uuid(),quantity:z.number().int().min(1).max(1000000),productType:z.string().min(2).max(60).default('STANDARD_CARD'),reference:z.string().trim().min(3).max(160),requestKey:z.string().min(16).max(160)}).strict(),
 z.object({action:z.literal('revokeGrant'),grantId:z.string().uuid(),reason:z.string().trim().min(3).max(500)}).strict(),
 z.object({action:z.literal('codeState'),codeId:z.string().uuid(),operation:z.enum(['SUSPEND','RESUME','REVOKE']),reason:z.string().trim().min(3).max(500)}).strict(),
]);
export async function GET(request:Request){
 try{
  const {supabase}=await requireUser();
  const params=new URL(request.url).searchParams;
  if(params.has('codeId')){
   const codeId=z.string().uuid().parse(params.get('codeId'));
   const {data,error}=await supabase.rpc('code_lifecycle',{p_code_id:codeId});
   if(error)return json({error:'تعذر الوصول إلى البطاقة.'},403);
   return json({lifecycle:data});
  }
  const organizationId=z.string().uuid().parse(params.get('organizationId'));
  const {data,error}=await supabase.rpc('organization_code_inventory',{p_organization_id:organizationId});
  if(error)return json({error:'تعذر الوصول إلى رصيد هذه الشركة.'},403);
  return json({inventory:data});
 }catch(e){return json({error:e instanceof UnauthorizedError?'UNAUTHORIZED':'تعذر تحميل الرصيد'},e instanceof UnauthorizedError?401:400);}
}
export async function POST(request:Request){
 try{
  if(!validPushOrigin(request,process.env.NEXT_PUBLIC_APP_URL))return json({error:'عنوان الطلب غير مسموح'},403);
  const {supabase}=await requireUser();
  const p=input.parse(await request.json());
  const result=p.action==='grant'?await supabase.rpc('grant_organization_codes',{p_organization_id:p.organizationId,p_product_type:p.productType,p_quantity:p.quantity,p_reference:p.reference,p_request_key:p.requestKey}):
   p.action==='revokeGrant'?await supabase.rpc('revoke_organization_code_grant',{p_grant_id:p.grantId,p_reason:p.reason}):
   await supabase.rpc('manage_code_lifecycle',{p_code_id:p.codeId,p_action:p.operation,p_reason:p.reason});
  if(result.error)return json({error:result.error.message.includes('IDEMPOTENCY_CONFLICT')?'هذا الطلب مسجل ببيانات مختلفة.': 'تعذر تنفيذ العملية. راجع صلاحياتك وحالة الشركة أو البطاقة.'},result.error.code==='42501'?403:400);
  return json({result:result.data});
 }catch(e){return json({error:e instanceof UnauthorizedError?'UNAUTHORIZED':'راجع البيانات المدخلة'},e instanceof UnauthorizedError?401:400);}
}
