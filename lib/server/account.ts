import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountContext = {
  internalRole: string | null;
  memberships: Array<{
    membershipId:string; organizationId:string; organizationName:string; organizationType:string;
    organizationStatus:"PENDING"|"ACTIVE"|"SUSPENDED"|"REJECTED"; institutionalEnabled:boolean;
    legacyRole:string; roleId:string|null;
  }>;
  destination: "/admin" | "/partner" | "/app";
};

export async function getAccountContext(supabase: SupabaseClient): Promise<AccountContext> {
  const { error: provisioningError } = await supabase.rpc("provision_my_account");
  if (provisioningError) throw provisioningError;
  const { data, error } = await supabase.rpc("get_my_account_context");
  if (error || !data) throw error ?? new Error("ACCOUNT_CONTEXT_MISSING");
  return data as AccountContext;
}
