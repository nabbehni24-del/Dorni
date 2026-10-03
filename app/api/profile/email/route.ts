import { json, requireUser, UnauthorizedError } from '@/lib/server/http';
export async function GET() {
  try {
    const {user,supabase}=await requireUser();
    const {data,error}=await supabase.rpc('my_email_verification');
    if(error) return json({error:'تعذر تحميل حالة البريد'},503);
    return json({email:user.email??null,verified:data?.verified===true});
  } catch(error) {
    return json({error:'تعذر تحميل حالة البريد'},error instanceof UnauthorizedError?401:503);
  }
}
