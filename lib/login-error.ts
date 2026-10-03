// Only expose allowlisted Auth reasons, never raw provider messages or account data.
export function loginFailure(error: {code?: string; status?: number}) {
  if (error.code === 'email_not_confirmed') return {status: 403, error: 'أكد بريدك من الرسالة أولًا، ثم حاول تسجيل الدخول مرة أخرى.'};
  if (error.status === 429) return {status: 429, error: 'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.'};
  if (error.code === 'invalid_credentials') return {status: 401, error: 'البريد أو كلمة المرور غير صحيحة'};
  return {status: 503, error: 'تعذر إكمال تسجيل الدخول الآن. حاول مرة أخرى بعد قليل.'};
}
