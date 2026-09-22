export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Never retry mutations automatically: a lost response may still have committed. */
export async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store", signal: init.signal ?? AbortSignal.timeout(30000) });
  } catch {
    throw new ApiError(init.method && init.method !== "GET"
      ? "تعذر تأكيد العملية. تحقق من الاتصال وراجع بياناتك قبل إعادة المحاولة."
      : "تعذر الاتصال بدورني. تحقق من الإنترنت وحاول مرة أخرى.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error === "string" && data.error !== "UNAUTHORIZED"
      ? data.error : response.status === 401 ? "انتهت الجلسة، سجّل الدخول من جديد." : "تعذر إكمال الطلب، حاول مرة أخرى.";
    throw new ApiError(message, response.status);
  }
  if (!data) throw new ApiError("وصل رد غير مكتمل من الخادم. حاول تحديث البيانات.", response.status);
  return data as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "تعذر إكمال العملية، حاول مرة أخرى.";
}

export async function copyText(value: string) {
  try { await navigator.clipboard.writeText(value); }
  catch { throw new Error("تعذر النسخ تلقائياً. افتح الرابط وانسخه من شريط العنوان."); }
}
