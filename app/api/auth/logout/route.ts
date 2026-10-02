import { json } from "@/lib/server/http";
import { createServerSupabase } from "@/lib/supabase/server";
import {cookies} from 'next/headers';
import {activationCookie} from '@/lib/server/activation-context';
export async function POST() {
  const supabase = await createServerSupabase();
  // Revoke this session's device bindings before removing its auth session.
  const {data:{user}}=await supabase.auth.getUser();
  if(user){
    const detached=await supabase.rpc("push_device",{p_action:"logout"});
    // Auth session revocation below independently prevents delivery, even during a push outage.
    if(detached.error && !detached.error.message.includes("AUTH_REQUIRED")) console.warn("PUSH_DETACH_UNAVAILABLE");
  }
  const {error}=await supabase.auth.signOut({scope:"local"});
  if(!error)(await cookies()).delete(activationCookie);
  return error?json({error:"تعذر تسجيل الخروج"},503):json({ok:true});
}

