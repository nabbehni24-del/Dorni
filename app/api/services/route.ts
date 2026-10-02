import {z} from 'zod';
import {json,requireUser,UnauthorizedError} from '@/lib/server/http';
import {validPushOrigin} from '@/lib/server/push-origin';
const uuid=z.string().uuid(),key=z.string().min(16).max(160),reason=z.string().trim().min(3).max(500);
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('order'),codeId:uuid,versionId:uuid,priceId:uuid.nullable().default(null),source:z.enum(['MANUAL_ADMIN','PAYMENT_PROVIDER']),provider:z.string().min(1).max(80),purpose:z.enum(['RENEWAL','MANUAL_EXTENSION','PLAN_CHANGE']),requestKey:key,reason}).strict(),
 z.object({action:z.literal('confirm'),orderId:uuid}).strict(),
 z.object({action:z.literal('replace'),oldCodeId:uuid,newCodeId:uuid,requestKey:key,reason}).strict(),
 z.object({action:z.literal('version'),code:z.string().regex(/^[A-Z][A-Z0-9_]{2,60}$/),name:z.string().min(1).max(120),unit:z.enum(['DAYS','MONTHS']),value:z.number().int().min(1).max(3660)}).strict(),
 z.object({action:z.literal('price'),versionId:uuid,amountMinor:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),currency:z.string().regex(/^[A-Z]{3}$/)}).strict(),
 z.object({action:z.literal('default'),versionId:uuid}).strict(),
 z.object({action:z.literal('attach'),codeId:uuid,versionId:uuid}).strict(),
 z.object({action:z.literal('active'),planId:uuid,active:z.boolean()}).strict(),
]);
export async function GET(request:Request){try{
 const {supabase}=await requireUser();const code=new URL(request.url).searchParams.get('codeId');
 const result=code?await supabase.rpc('read_endpoint_service',{p_code:uuid.parse(code)}):await supabase.rpc('read_service_catalog');
 if(result.error)return json({error:'تعذر الوصول إلى بيانات الخدمة.'},403);
 return json({data:result.data});
}catch(e){return json({error:e instanceof UnauthorizedError?'UNAUTHORIZED':'طلب غير صالح'},e instanceof UnauthorizedError?401:400);}}
export async function POST(request:Request){try{
 if(!validPushOrigin(request,process.env.NEXT_PUBLIC_APP_URL))return json({error:'عنوان الطلب غير مسموح'},403);
 const {supabase}=await requireUser();const p=input.parse(await request.json());
 const result=p.action==='order'?await supabase.rpc('create_service_order',{p_code:p.codeId,p_version:p.versionId,p_price:p.priceId,p_source:p.source,p_provider:p.provider,p_purpose:p.purpose,p_key:p.requestKey,p_reason:p.reason}):
 p.action==='confirm'?await supabase.rpc('confirm_manual_service_order',{p_order:p.orderId}):
 p.action==='replace'?await supabase.rpc('replace_service_card',{p_old:p.oldCodeId,p_new:p.newCodeId,p_key:p.requestKey,p_reason:p.reason}):
 await supabase.rpc('manage_service_catalog',{p_action:p.action,p_data:Object.fromEntries(Object.entries(p).filter(([k])=>k!=='action'))});
 if(result.error)return json({error:'تعذر تنفيذ العملية. راجع التخويل وحالة البطاقة والطلب المعتمد.'},result.error.code==='42501'?403:409);
 return json({data:result.data});
}catch(e){return json({error:e instanceof UnauthorizedError?'UNAUTHORIZED':'راجع البيانات المدخلة'},e instanceof UnauthorizedError?401:400);}}
