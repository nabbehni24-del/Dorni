import { createClient } from "supabase";
const permissions = ["view", "view_all", "reply", "notes", "status", "assign"];
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
Deno.serve(async (request) => {
  if (request.method !== "POST")
    return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const authorization = request.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer "))
      return reply({ error: "AUTH_REQUIRED" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await caller.auth.getUser();
    if (authError || !user) return reply({ error: "AUTH_REQUIRED" }, 401);
    // This RPC checks account status, live auth.sessions, and current SUPER_ADMIN membership.
    const access = await caller.rpc("support_staff_admin", {
      p_action: "list",
    });
    if (access.error) return reply({ error: "FORBIDDEN" }, 403);
    const input = await request.json();
    const admin = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    let target: string;
    let email: string;
    if (input.action === "reissue") {
      const staff = (access.data ?? []).find(
        (row: { id: string; active: boolean }) =>
          row.id === input.id && row.active,
      );
      if (!staff) return reply({ error: "NOT_FOUND" }, 404);
      const existing = await admin.auth.admin.getUserById(staff.id);
      if (
        existing.error ||
        !existing.data.user?.app_metadata?.staff_provisioned_by ||
        existing.data.user.email_confirmed_at
      )
        return reply({ error: "ALREADY_ACTIVATED" }, 409);
      target = staff.id;
      email = staff.email;
    } else if (input.action === "create") {
      if (
        typeof input.name !== "string" ||
        input.name.trim().length < 2 ||
        input.name.length > 100 ||
        typeof input.email !== "string" ||
        input.email.length > 254 ||
        !/^\S+@\S+\.\S+$/.test(input.email) ||
        !Array.isArray(input.permissions) ||
        !input.permissions.includes("view") ||
        input.permissions.length > 6 ||
        input.permissions.some((p: string) => !permissions.includes(p))
      )
        return reply({ error: "INVALID_INPUT" }, 400);
      email = input.email.trim().toLowerCase();
      // createUser is exclusive: existing customer/admin accounts must never be claimed or reset.
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: { full_name: input.name.trim() },
        app_metadata: { staff_provisioned_by: user.id },
      });
      if (created.error || !created.data.user)
        return reply(
          {
            error:
              created.error?.code === "email_exists"
                ? "EMAIL_EXISTS"
                : "CREATE_FAILED",
          },
          409,
        );
      target = created.data.user.id;
      const grant = await caller.rpc("support_staff_provision", {
        p_user_id: target,
        p_permissions: input.permissions,
      });
      if (grant.error) {
        // Roll back only this newly created, passwordless and unconfirmed account.
        await admin.auth.admin.deleteUser(target);
        return reply({ error: "PROVISION_FAILED" }, 403);
      }
    } else return reply({ error: "INVALID_INPUT" }, 400);
    const link = await admin.auth.admin.generateLink({ type: "invite", email });
    if (link.error || !link.data.properties?.hashed_token)
      return reply({ error: "LINK_FAILED" }, 502);
    const audit = await admin
      .from("audit_logs")
      .insert({
        actor_id: user.id,
        actor_kind: "ADMIN",
        action: "SUPPORT_ACTIVATION_LINK",
        entity_type: "internal_membership",
        entity_id: target,
        safe_metadata: { reissued: input.action === "reissue" },
      });
    if (audit.error) return reply({ error: "AUDIT_FAILED" }, 500);
    return reply({
      ok: true,
      id: target,
      tokenHash: link.data.properties.hashed_token,
    });
  } catch {
    return reply({ error: "PROVISION_FAILED" }, 500);
  }
});
