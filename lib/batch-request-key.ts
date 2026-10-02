// Retain the same request through network errors and page refreshes.
export function batchRequestKey(scope: string): string {
  const name = `dorni:batch-request:${scope}`;
  const existing = sessionStorage.getItem(name);
  if (existing) return existing;
  const key = crypto.randomUUID();
  sessionStorage.setItem(name, key);
  return key;
}
export function completeBatchRequest(scope: string) {
  sessionStorage.removeItem(`dorni:batch-request:${scope}`);
}
