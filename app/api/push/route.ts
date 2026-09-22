import { z } from "zod";
import { json, requireUser, UnauthorizedError } from "@/lib/server/http";
import { validPushOrigin } from "@/lib/server/push-origin";

const input = z.object({
  action:z.enum(["status","subscribe","disable","test"]),
  endpoint:z.string().url().max(2048).optional(),
  keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}$/)}).optional(),
});
export async function GET() {
  try {
    const {supabase}=await requireUser();
    const {data,error}=await supabase.rpc("push_device",{p_action:"status"});
    if(error) return json({error:"خدمة إشعارات الجهاز غير متاحة حالياً."},503);
    return json(data);
  } catch(e) {return json({error:e instanceof UnauthorizedError?"UNAUTHORIZED":"تعذر تحميل إعدادات الإشعارات"},e instanceof UnauthorizedError?401:503);}
}
export async function POST(request:Request) {
  try {
    if(!validPushOrigin(request, process.env.NEXT_PUBLIC_APP_URL)) return json({error:"تعذر التحقق من عنوان التطبيق. افتح دورني من رابطه الرسمي وحاول مرة أخرى."},403);
    const {supabase}=await requireUser();
    const p=input.parse(await request.json());
    if(!p.endpoint || (p.action==="subscribe"&&!p.keys)) return json({error:"اشتراك الجهاز غير مكتمل"},400);
    const {data,error}=await supabase.rpc("push_device",{p_action:p.action,p_endpoint:p.endpoint,p_p256dh:p.keys?.p256dh??null,p_auth:p.keys?.auth??null});
    if(error) {
      const rate=error.message.includes("TEST_RATE_LIMIT");
      return json({error:rate?"انتظر دقيقة قبل إرسال تجربة أخرى.":error.message.includes("DEVICE_LIMIT")?"وصلت للحد الأقصى للأجهزة. عطّل إشعارات جهاز قديم أولاً.":"تعذر حفظ إعدادات الإشعارات. حاول مرة أخرى."},rate?429:400);
    }
    return json(data);
  }catch(e){return json({error:e instanceof UnauthorizedError?"UNAUTHORIZED":"بيانات اشتراك الجهاز غير صالحة"},e instanceof UnauthorizedError?401:400);}
}

