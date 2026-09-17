import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { requireUser } from "./http";

export async function requireInternal(allowed?:string[]){const auth=await requireUser();const admin=createAdminSupabase();const {data,error}=await admin.from("internal_memberships").select("role_code,active").eq("user_id",auth.user.id).eq("active",true).maybeSingle();if(error||!data||(allowed&&!allowed.includes(data.role_code)))throw new ForbiddenError();return {...auth,admin,role:data.role_code as string};}
export async function requirePartner(){const auth=await requireUser();const {data,error}=await auth.supabase.from("partner_memberships").select("id,organization_id,role,status,partner_organizations(id,name,type,status)").eq("user_id",auth.user.id).eq("status","ACTIVE").limit(1).maybeSingle();if(error||!data)throw new ForbiddenError();return {...auth,membership:data};}
export class ForbiddenError extends Error{}
