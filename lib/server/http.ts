import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function body<T>(request: Request): Promise<T> { return request.json() as Promise<T>; }
export async function requireUser() {
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new UnauthorizedError();
  return { user, supabase };
}
export class UnauthorizedError extends Error {}
