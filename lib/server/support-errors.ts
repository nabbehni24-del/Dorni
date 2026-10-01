import { json, UnauthorizedError } from "./http";
import { ForbiddenError } from "./access";
import { z } from "zod";

const errors: Record<string, [string, number]> = {
  FORBIDDEN: ["ليس لديك صلاحية لهذه العملية، أو تم إيقاف وصولك.", 403],
  AUTH_REQUIRED: ["سجّل الدخول مجددًا.", 401],
  REGISTER_FIRST: ["البريد غير مرتبط بحساب نشط ومؤكد. اطلب من الموظف التسجيل وتأكيد بريده أولًا.", 400],
  ROLE_CONFLICT: ["هذا الحساب له دور إداري آخر ولا يمكن استبداله بدور دعم.", 409],
  CONFLICT: ["تغيّرت التذكرة بواسطة مستخدم آخر. تم تحديثها؛ راجعها ثم أعد المحاولة.", 409],
  NOT_FOUND: ["التذكرة أو الموظف غير موجود.", 404],
  TICKET_CLOSED: ["التذكرة مغلقة. يلزم إعادة فتحها قبل إرسال رد.", 409],
  INVALID_ASSIGNEE: ["الموظف المختار غير متاح لاستقبال التذاكر.", 400],
  INVALID_INPUT: ["راجع البيانات المدخلة.", 400],
};
export function supportError(error: unknown) {
  if (error instanceof UnauthorizedError) return json({ error: "سجّل الدخول للمتابعة." }, 401);
  if (error instanceof ForbiddenError) return json({ error: errors.FORBIDDEN[0] }, 403);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: errors.INVALID_INPUT[0] }, 400);
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  for (const [code, [text, status]] of Object.entries(errors)) if (message.includes(code)) return json({ error: text }, status);
  return json({ error: "تعذر الاتصال بمنظومة الدعم. أعد المحاولة." }, 500);
}
