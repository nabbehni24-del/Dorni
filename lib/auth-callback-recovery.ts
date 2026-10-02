export function callbackErrorReason(error: unknown): 'email_browser' | 'email_link' {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'pkce_code_verifier_not_found') return 'email_browser';
  return 'email_link';
}
