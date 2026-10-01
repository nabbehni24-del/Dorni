# Administrative workspaces

## Navigation and responsibilities

- `/admin`: system overview; separate routes for companies, production, institutions, support staff, inbox, audit and settings.
- `/partner?section=...`: existing tenant-scoped workflows retained; mobile modal navigation, browser back/forward support and personal settings added.
- `/support`: dedicated inbox and personal settings, without sending staff through customer settings.
- Settings change appearance immediately on the device; password changes affect only the authenticated account.

## Dedicated support account creation

1. A live SUPER_ADMIN session submits name, email and allowlisted support permissions.
2. `support-staff-provision` verifies the caller with Auth and the existing session-aware support-admin RPC.
3. Auth creates a new passwordless, unconfirmed account. Existing accounts are never reset or replaced.
4. Caller-scoped SQL grants SUPPORT and records an audit event atomically. It checks server-owned app metadata, never editable user metadata.
5. A one-use invitation is returned for private manual delivery. No email delivery is claimed. Token is in the URL fragment, not a server-logged query parameter.
6. `/staff/activate` consumes the invitation only on POST, verifies the SUPPORT role, and lets the employee choose a password. Expiry follows Supabase Auth configuration.
7. Pending users may receive replacement activation links; confirmed users cannot. Disabling access uses the existing immediate-revocation workflow.

The Edge Function uses explicit Auth verification plus database session checks (`verify_jwt=false` supports asymmetric signing keys); missing/invalid JWTs are rejected. Service credentials remain inside the Edge runtime.

## Database changes

Applied SQL sources: `supabase/sql/support_staff_provision.sql` and `supabase/sql/admin_partner_guard.sql`.
Migration names: `support_staff_provisioning`, `support_provision_error_contract`, `admin_partner_live_session_guard`.
The company status function now rejects missing roles and invalid/revoked sessions instead of relying on a nullable comparison.

## Verification

- Unit/contract tests: `tests/workspace-redesign.test.mjs` (mocked Auth provider; not a live email/invitation test).
- Real SQL security assertions: `tests/support-provisioning.sql`; all fixtures roll back even on success.
- Anonymous request to deployed provisioning function returns 401.
- Existing tests, TypeScript, lint and production build must pass before publication.
- Local Windows checkout uses a node_modules junction; default Turbopack rejects that external junction. `next build --webpack` verifies this checkout; production Docker uses a normal dependency directory.

Live creation and redemption with the actual Auth service still require a dedicated acceptance-test account; do not describe mocked provider tests as end-to-end proof.
