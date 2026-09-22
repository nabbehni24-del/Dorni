import { json,requireUser,UnauthorizedError } from '@/lib/server/http';
import { validPushOrigin } from '@/lib/server/push-origin';
export async function POST(request:Request){try{if(!validPushOrigin(request,process.env.NEXT_PUBLIC_APP_URL))return json({error:'غير مسموح'},403);const {supabase}=await requireUser();const p=await request.json();if(p.confirm!=='LOGOUT_OTHERS')return json({error:'أكد تسجيل الخروج من الأجهزة الأخرى'},400);const {error}=await supabase.auth.signOut({scope:'others'});if(error)throw error;return json({ok:true});}catch(e){return json({error:e instanceof UnauthorizedError?'UNAUTHORIZED':'تعذر إنهاء الجلسات الأخرى'},e instanceof UnauthorizedError?401:500);}}

