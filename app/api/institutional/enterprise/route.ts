import {z} from "zod";
import {body,json,requireUser,UnauthorizedError} from "@/lib/server/http";
import {validPushOrigin} from "@/lib/server/push-origin";

const id=z.string().uuid();
const nullableId=id.nullable();
const site=z.object({action:z.literal("site"),organizationId:id,siteId:nullableId,code:z.string().trim().min(2).max(30),name:z.string().trim().min(2).max(120),siteType:z.enum(["HEADQUARTERS","BRANCH","FACILITY","PARKING","WAREHOUSE","FIELD_ZONE"]),address:z.string().trim().max(240),status:z.enum(["ACTIVE","INACTIVE"]),primary:z.boolean()});
const unit=z.object({action:z.literal("unit"),organizationId:id,unitId:nullableId,siteId:nullableId,parentUnitId:nullableId,code:z.string().trim().min(2).max(30),name:z.string().trim().min(2).max(120),unitType:z.enum(["DIVISION","DEPARTMENT","TEAM","SHIFT"]),costCenter:z.string().trim().max(40),status:z.enum(["ACTIVE","INACTIVE"])});
const scope=z.object({action:z.literal("scope"),organizationId:id,membershipId:id,siteId:nullableId,unitId:nullableId,scopeRole:z.enum(["MEMBER","SUPERVISOR","MANAGER"]),primary:z.boolean()});
const operation=z.object({action:z.literal("operation"),organizationId:id,actionId:id,assignedMembershipId:nullableId,priority:z.enum(["LOW","NORMAL","HIGH","CRITICAL"]),siteId:nullableId,unitId:nullableId,note:z.string().trim().max(500),expectedUpdatedAt:z.string().datetime()});
const policy=z.object({action:z.literal("policy"),organizationId:id,priority:z.enum(["LOW","NORMAL","HIGH","CRITICAL"]),acknowledgementMinutes:z.number().int().min(1).max(10080),resolutionMinutes:z.number().int().min(1).max(43200),escalationMinutes:z.number().int().min(1).max(10080)});
const inventory=z.object({action:z.literal("inventory"),organizationId:id,batchId:id,siteId:nullableId,unitId:nullableId,custodianMembershipId:nullableId,quantity:z.number().int().positive().max(100000)});
const mutation=z.discriminatedUnion("action",[site,unit,scope,operation,policy,inventory]);

export async function GET(request:Request){
  try{
    const url=new URL(request.url);
    const organizationId=id.parse(url.searchParams.get("organizationId"));
    const days=z.coerce.number().int().min(7).max(366).catch(30).parse(url.searchParams.get("days"));
    const to=new Date(),from=new Date(to);from.setDate(from.getDate()-days);
    const {supabase}=await requireUser();
    const {data,error}=await supabase.rpc("get_enterprise_console",{p_organization_id:organizationId,p_from:from.toISOString(),p_to:to.toISOString()});
    if(error)return json({error:"لا تملك صلاحية عرض مركز إدارة المؤسسة"},403);
    return json(data);
  }catch(error){return json({error:error instanceof UnauthorizedError?"UNAUTHORIZED":"طلب غير صالح"},error instanceof UnauthorizedError?401:400);}
}

export async function POST(request:Request){
  try{
    if(!validPushOrigin(request,process.env.NEXT_PUBLIC_APP_URL))return json({error:"عنوان الطلب غير مسموح"},403);
    const value=mutation.parse(await body(request));
    if(value.action==="scope"&&!value.siteId&&!value.unitId)return json({error:"النطاق يحتاج موقعاً أو وحدة"},400);
    if(value.action==="inventory"&&!value.siteId&&!value.unitId)return json({error:"التوزيع يحتاج موقعاً أو وحدة"},400);
    if(value.action==="policy"&&value.acknowledgementMinutes>value.resolutionMinutes)return json({error:"مهلة الإقرار يجب ألا تتجاوز مهلة الحل"},400);
    const {supabase}=await requireUser();
    let result:{data:unknown;error:{message:string}|null};
    if(value.action==="site")result=await supabase.rpc("org_upsert_site",{p_organization_id:value.organizationId,p_site_id:value.siteId,p_code:value.code,p_name:value.name,p_site_type:value.siteType,p_address:value.address,p_status:value.status,p_is_primary:value.primary});
    else if(value.action==="unit")result=await supabase.rpc("org_upsert_unit",{p_organization_id:value.organizationId,p_unit_id:value.unitId,p_site_id:value.siteId,p_parent_unit_id:value.parentUnitId,p_code:value.code,p_name:value.name,p_unit_type:value.unitType,p_cost_center:value.costCenter,p_status:value.status});
    else if(value.action==="scope")result=await supabase.rpc("org_assign_member_scope",{p_organization_id:value.organizationId,p_membership_id:value.membershipId,p_site_id:value.siteId,p_unit_id:value.unitId,p_scope_role:value.scopeRole,p_is_primary:value.primary});
    else if(value.action==="operation")result=await supabase.rpc("org_manage_operation",{p_organization_id:value.organizationId,p_action_id:value.actionId,p_assigned_membership_id:value.assignedMembershipId,p_priority:value.priority,p_site_id:value.siteId,p_unit_id:value.unitId,p_note:value.note,p_expected_updated_at:value.expectedUpdatedAt});
    else if(value.action==="policy")result=await supabase.rpc("org_set_sla_policy",{p_organization_id:value.organizationId,p_priority:value.priority,p_acknowledgement_minutes:value.acknowledgementMinutes,p_resolution_minutes:value.resolutionMinutes,p_escalation_minutes:value.escalationMinutes});
    else result=await supabase.rpc("org_allocate_inventory",{p_organization_id:value.organizationId,p_batch_id:value.batchId,p_site_id:value.siteId,p_unit_id:value.unitId,p_custodian_membership_id:value.custodianMembershipId,p_quantity:value.quantity});
    if(result.error)return json({error:result.error.message.includes("CONFLICT")?"تم تعديل الحالة من مستخدم آخر؛ حدّث الصفحة وحاول مجدداً":"لا تملك الصلاحية أو البيانات غير صالحة"},result.error.message.includes("CONFLICT")?409:403);
    return json({result:result.data});
  }catch(error){return json({error:error instanceof UnauthorizedError?"UNAUTHORIZED":"بيانات الإدارة غير صالحة"},error instanceof UnauthorizedError?401:400);}
}

