import {z} from 'zod';
import {json,requireUser,UnauthorizedError} from '@/lib/server/http';
import {validPushOrigin} from '@/lib/server/push-origin';
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('request'),codeId:z.string().uuid(),versionId:z.string().uuid()}).strict(),
 z.object({action:z.enum(['approve','reject']),id:z.string().uuid(),reason:z.string().trim().min(3).max(500)}).strict(),
 z.object({action:z.literal('threshold'),days:z.number().int().min(0).max(365)}).strict(),
]);
export async function GET(request:Request){try{
 const {supabase}=await requireUser();const admin=new URL(request.url).searchParams.get('admin')==='1';
 const result=await supabase.rpc(admin?'manage_renewal_requests':'owner_services',{p_action:'list'});
 return result.error?json({error:'تعذر تحميل الخدمة'},403):json({data:result.data});
}catch(e){return json({error:'تعذر تحميل الخدمة'},e instanceof UnauthorizedError?401:503);}}
export async function POST(request:Request){try{
 if(!validPushOrigin(request,process.env.NEXT_PUBLIC_APP_URL)||!request.headers.get('origin'))return json({error:'طلب غير مسموح'},403);
 const {supabase}=await requireUser();const p=input.parse(await request.json());
 const result=await supabase.rpc(p.action==='request'?'owner_services':'manage_renewal_requests',{p_action:p.action,p_data:p});
 return result.error?json({error:'تعذر إكمال الطلب. حدّث الصفحة للتحقق من حالته.'},409):json({data:result.data});
}catch(e){return json({error:'راجع البيانات وحاول مجددًا'},e instanceof UnauthorizedError?401:400);}}
