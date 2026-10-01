import {requireInternal,ForbiddenError} from '@/lib/server/access';
import {json,UnauthorizedError} from '@/lib/server/http';
import {validPushOrigin} from '@/lib/server/push-origin';
import {auditFiltersSchema,auditCsv,type AuditData} from '@/lib/admin-audit';
async function run(request:Request,exporting:boolean){
 try{
  if(exporting&&!validPushOrigin(request,process.env.NEXT_PUBLIC_APP_URL))return json({error:'الطلب غير مسموح.'},403);
  const {supabase}=await requireInternal(['SUPER_ADMIN']);
  const input=exporting?await request.json():Object.fromEntries(new URL(request.url).searchParams);
  const parsed=auditFiltersSchema.safeParse(input);
  if(!parsed.success)return json({error:'راجع الفلاتر والتواريخ؛ أقصى فترة سنة واحدة.'},400);
  const {data,error}=await supabase.rpc('admin_audit',{p_filters:parsed.data,p_export:exporting});
  if(error){if(error.code==='42501')return json({error:'ليس لديك صلاحية لعرض السجل أو تصديره.'},403);if(error.message.includes('EXPORT_TOO_LARGE'))return json({error:'النتائج تتجاوز 10,000 عملية. ضيّق الفترة أو الفلاتر لتصديرها كاملة.'},422);throw error;}
  const result=data as AuditData;
  if(!exporting)return json(result);
  return new Response(auditCsv(result.rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="dorni-audit-${parsed.data.from}-${parsed.data.to}.csv"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Export-Rows':String(result.rows.length)}});
 }catch(error){if(error instanceof UnauthorizedError)return json({error:'انتهت الجلسة. سجّل الدخول مجدداً.'},401);if(error instanceof ForbiddenError)return json({error:'هذه الصفحة مخصصة للإدارة.'},403);if(error instanceof SyntaxError)return json({error:'بيانات الطلب غير صحيحة.'},400);return json({error:'تعذر تحميل سجل العمليات. حاول مجدداً.'},500);}
}
export function GET(request:Request){return run(request,false);}
export function POST(request:Request){return run(request,true);}
