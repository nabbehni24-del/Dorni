import {z} from 'zod';
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
export const auditFiltersSchema=z.object({
 from:day,to:day,action:z.string().max(100).default(''),kind:z.string().max(60).default(''),entity:z.string().max(100).default(''),
 search:z.string().trim().max(80).default(''),page:z.coerce.number().int().min(1).max(10000).default(1),
 size:z.coerce.number().refine(v=>[25,50,100].includes(v)).default(25),snapshot:z.string().datetime({offset:true}).optional(),
}).strict().refine(v=>Date.parse(v.to)>=Date.parse(v.from)&&Date.parse(v.to)-Date.parse(v.from)<=365*86400000,{message:'اختر فترة صحيحة لا تتجاوز سنة.'});
export type AuditFilters=z.infer<typeof auditFiltersSchema>;
export type AuditRow={id:string;action:string;actor_kind:string;entity_type:string;entity_id:string|null;created_at:string};
export type AuditData={rows:AuditRow[];total:number;snapshot:string;page:number;size:number;metrics:{total:number;actors:number;actions:number;today:number};options:{actions:string[];kinds:string[];entities:string[]}};
export const auditLabels:Record<string,string>={
 REPORT_RESPONDED:'ردّ على بلاغ',CODE_CLAIMED:'تفعيل بطاقة',PARTNER_ACCOUNT_PROVISIONED:'تجهيز حساب شركة',BATCH_GENERATED:'إصدار دفعة أكواد',
 SUPPORT_ACTIVATION_LINK:'إصدار رابط تفعيل موظف',SUPPORT_STAFF_CREATE:'إنشاء موظف دعم',SUPPORT_STAFF_SAVE:'تعديل صلاحيات موظف',
 SUPPORT_CENTER_SETTINGS:'تعديل إعدادات مركز الدعم',SUPPORT_REPLY:'ردّ فريق الدعم',SUPPORT_NOTE:'ملاحظة داخلية للدعم',SUPPORT_STATUS:'تغيير حالة تذكرة',SUPPORT_ASSIGN:'إسناد تذكرة',
 PARTNER_APPLICATION_SUBMITTED:'طلب انضمام شركة',PARTNER_STATUS_CHANGED:'تغيير حالة شركة',PRODUCTION_EXPORT_ACCESSED:'تحميل ملف إنتاج',
 ADMIN_BOOTSTRAPPED:'تهيئة حساب الإدارة',admin_membership_granted:'منح دور الإدارة',AUDIT_LOG_EXPORTED:'تصدير سجل العمليات',
 PROFILE:'تحديث الملف الشخصي',VEHICLE_EDIT:'تعديل سيارة',VEHICLE_ARCHIVE:'أرشفة سيارة',CARD_RETIRE:'إيقاف بطاقة',TICKET_CREATE:'إنشاء تذكرة دعم',
 ADMIN:'الإدارة',OWNER:'مالك السيارة',PARTNER:'شركة',SUPPORT:'فريق الدعم',SYSTEM:'النظام',
 report:'بلاغ',code:'كود',code_batch:'دفعة أكواد',partner_organization:'شركة',internal_membership:'حساب داخلي',
 owner_workspace:'حساب مالك السيارة',support_center:'مركز الدعم',support_ticket:'تذكرة دعم',production_export:'ملف إنتاج',audit_log:'سجل العمليات',
};
export const auditLabel=(value:string)=>auditLabels[value]??value;
export function tripoliDate(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Tripoli',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function auditDefaults(days=30):AuditFilters{const to=tripoliDate();const from=new Date(to+'T00:00:00Z');from.setUTCDate(from.getUTCDate()-days+1);return {from:from.toISOString().slice(0,10),to,action:'',kind:'',entity:'',search:'',page:1,size:25};}
export function csvCell(value:unknown){let text=String(value??'');if(/^[\s\uFEFF]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
export function auditCsv(rows:AuditRow[]){const lines=[['رقم العملية','العملية','رمز العملية','نوع الحساب','نوع السجل','مرجع السجل','الوقت — ليبيا','الوقت — UTC'],...rows.map(r=>[r.id,auditLabel(r.action),r.action,auditLabel(r.actor_kind),auditLabel(r.entity_type),r.entity_id,new Date(r.created_at).toLocaleString('ar-LY',{timeZone:'Africa/Tripoli'}),new Date(r.created_at).toISOString()])];return '\uFEFF'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n');}
