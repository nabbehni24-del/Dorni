import {createServerSupabase} from '@/lib/supabase/server';
import {json} from '@/lib/server/http';
export async function GET(){
 const supabase=await createServerSupabase();
 const {data,error}=await supabase.rpc('account_recovery_contacts');
 return error?json({error:'تعذر تحميل وسائل الدعم'},503):json(data);
}
