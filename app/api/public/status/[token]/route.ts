import { json } from "@/lib/server/http";
import { digest } from "@/lib/server/security";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { validPushOrigin } from "@/lib/server/push-origin";
type Context = { params: Promise<{ token: string }> };
async function run(context: Context, action: "status" | "escalate") {
  const { token } = await context.params;
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) return json({error:"رابط الحالة غير صالح"},404);
  try {
    const { data, error } = await createAdminSupabase().rpc("report_support", { p_hash: await digest(token), p_action: action });
    if (error) {
      if(error.message.includes("NOT_READY")) return json({error:"التصعيد غير متاح الآن؛ حدّث حالة البلاغ."},409);
      if(error.message.includes("NOT_FOUND")) return json({error:"رابط الحالة منتهي أو غير صالح"},404);
      return json({error:"تعذر تحميل البلاغ؛ حاول مجدداً."},503);
    }
    return json(data);
  } catch { return json({error:"تعذر الاتصال بالخدمة."},503); }
}
export async function GET(_request: Request, context: Context) { return run(context,"status"); }
export async function POST(request: Request, context: Context) {
  if (!validPushOrigin(request,process.env.NEXT_PUBLIC_APP_URL)) return json({error:"عنوان الطلب غير مسموح"},403);
  return run(context,"escalate");
}
