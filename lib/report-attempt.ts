// A retry reuses its capability so an uncertain response never creates a new submission.
export type ReportAttempt = { reason: string; statusToken: string; sessionToken: string };
export function newReportToken() {
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export function readAttempt(value: string | null): ReportAttempt | null {
  try {
    const p=JSON.parse(value??"null");
    if(p&&typeof p.reason==="string"&&/^[A-Za-z0-9_-]{43}$/.test(p.statusToken)&&/^[A-Za-z0-9_-]{20,200}$/.test(p.sessionToken)) return {reason:p.reason,statusToken:p.statusToken,sessionToken:p.sessionToken};
  } catch { /* Invalid local storage does not authorize anything. */ }
  return null;
}
