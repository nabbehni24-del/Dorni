export type BatchDraft = {organizationId:string;quantity:number};
const name=(actor:string)=>`dorni:pending-admin-batch:${actor}`;
export function readBatchDraft(actor:string):BatchDraft|null {
 const raw=sessionStorage.getItem(name(actor));
 if(!raw)return null;
 const value=JSON.parse(raw);
 if(typeof value.organizationId!=='string'||!Number.isInteger(value.quantity)||value.quantity<1||value.quantity>1000)throw new Error('تعذر استعادة طلب الإصدار المحفوظ. لا تبدأ إصدارًا جديدًا قبل مراجعة الدفعات.');
 return {organizationId:value.organizationId,quantity:value.quantity};
}
export function saveBatchDraft(actor:string,draft:BatchDraft){sessionStorage.setItem(name(actor),JSON.stringify(draft));}
export function clearBatchDraft(actor:string){sessionStorage.removeItem(name(actor));}
