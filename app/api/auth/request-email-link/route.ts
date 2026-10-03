import { json } from "@/lib/server/http";
export async function POST() {
  return json({error:"الدخول بالبريد وكلمة المرور. لاسترجاع الحساب تواصل مع الدعم.",code:"SUPPORT_RECOVERY_REQUIRED"},403);
}

