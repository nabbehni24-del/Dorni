import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountContext = {
  internalRole: string | null;
  partnerRole: string | null;
  organizationId: string | null;
  organizationName: string | null;
  destination: "/admin" | "/partner" | "/app";
};

export async function getAccountContext(supabase: SupabaseClient): Promise<AccountContext> {
  const { data, error } = await supabase.rpc("get_my_account_context");
  if (error || !data) throw error ?? new Error("ACCOUNT_CONTEXT_MISSING");
  return data as AccountContext;
}
