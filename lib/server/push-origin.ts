/** Use a configured public origin, never untrusted forwarded headers behind a proxy. */
export function validPushOrigin(request: Request, publicUrl: string | undefined) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients still require authentication.
  try {
    const expected = new URL(publicUrl || request.url).origin;
    return origin !== "null" && new URL(origin).origin === expected;
  } catch { return false; }
}

