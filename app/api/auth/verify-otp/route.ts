import { json } from "@/lib/server/http";

export async function POST() {
  return json({ error: "تم إيقاف تسجيل الهاتف. استخدم البريد الإلكتروني وكلمة المرور." }, 410);
}
