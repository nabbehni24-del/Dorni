import {z} from 'zod';
import {json,requireUser,UnauthorizedError} from '@/lib/server/http';
import {validPushOrigin} from '@/lib/server/push-origin';
const input=z.object({phone:z.string().max(64).nullable(),expectedPhone:z.string().max(256).nullable()}).strict();
export async function GET(){try{const {supabase}=await requireUser();const {data,error}=await supabase.rpc('phone_profile',{p_action:'get'});return error?json({error:'تعذر تحميل رقم الهاتف'},403):json({data});}catch(e){return json({error:'تعذر تحميل رقم الهاتف'},e instanceof UnauthorizedError?401:503);}}
export async function POST(request:Request){try{
 if(!request.headers.get('origin')||!validPushOrigin(request,process.env.NEXT_PUBLIC_APP_URL))return json({error:'طلب غير مسموح'},403);
 const {supabase}=await requireUser();const p=input.parse(await request.json());
 const {data,error}=await supabase.rpc('phone_profile',{p_action:'save',p_phone:p.phone,p_expected:p.expectedPhone});
 if(error)return json({error:error.message.includes('INVALID_PHONE')?'أدخل رقمًا ليبيًا صحيحًا مع رمز الشبكة أو المدينة.':error.message.includes('PHONE_CHANGED')?'تغير الرقم في جلسة أخرى. حدّث البيانات قبل الحفظ.':'تعذر حفظ رقم الهاتف'},409);
 return json({data});
}catch(e){return json({error:'راجع البيانات وحاول مجددًا'},e instanceof UnauthorizedError?401:400);}}
