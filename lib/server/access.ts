import "server-only";
import { requireUser } from "./http";

export async function requireInternal(allowed?:string[]){const auth=await requireUser();const {data,error}=await auth.supabase.rpc("get_my_internal_role");const role=data as string|null;if(error||!role||(allowed&&!allowed.includes(role)))throw new ForbiddenError();return {...auth,role};}
export async function requirePartner(){const auth=await requireUser();const {data,error}=await auth.supabase.from("partner_memberships").select("id,organization_id,role,status,partner_organizations(id,name,type,status,trusted_generation,registration_number,generation_limit_per_day)").eq("user_id",auth.user.id).eq("status","ACTIVE").limit(1).maybeSingle();if(error||!data)throw new ForbiddenError();return {...auth,membership:data};}
export class ForbiddenError extends Error{}
