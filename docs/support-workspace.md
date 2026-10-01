# Support workspace

## Operation

- Admin: `/admin/support`; dedicated inbox: `/support`.
- Staff must register and confirm their email first. Only SUPER_ADMIN can grant SUPPORT to that exact existing account. Other internal roles cannot be overwritten.
- Base `view` sees assigned tickets; `view_all` also sees unassigned and other agents' tickets. Independent `reply`, `notes`, `status`, and `assign` capabilities are enforced in SQL.
- Disabling staff retains the account/history, immediately denies new support requests, and unassigns open tickets. The dashboard revalidates permissions at least every 15 seconds while visible; realtime invalidations normally refresh sooner.
- Replies do not silently change ticket status. Staff without `status` cannot close/reopen a case by replying.
- Notes require `notes` to read as well as write. Customers never receive them through RPC, table RLS, or realtime.
- Support cannot access the broad internal RLS path used by customer, export, and partner tables. Existing owners' `/api/support` contract is preserved; staff use `/api/support/workspace`.
- Existing SUPER_ADMIN retains full support access. No staff was added as part of deployment.

## Verification

- `tests/support-permissions.sql` runs SQL assertions against temporary users/sessions/tickets in a subtransaction and rolls all fixture changes back even on success. Tests cover assigned/all scope, RLS, notes, legacy bypasses, self-service/admin boundaries, duplicate reply retries, stale edits, closed tickets, revocation, and expired sessions.
- `node --test tests/*.test.mjs`, ESLint on changed files, and `next build --webpack`.
- Desktop and 390px browser rendering, opening tickets, and sending replies exercised with temporary local fixtures, removed before release. This is not a two-device production realtime test.

## Database

Hosted migration `support_workspace_capabilities` is tracked by Supabase. Its source is `supabase/sql/support_workspace.sql`. Migration includes fail-fast checks before adapting existing owner/context functions. The authorization test block was included in the same transaction on initial apply. Do not reapply the file blindly.

## Remaining operational limits

- No outbound automatic phone calls, support email invitations, staffing SLA, or public scanner escalation is claimed in this release. Those are separate integrations/workflows.
- Realtime uses RLS-protected Postgres Changes for the initial small team with a 15-second visible-page fallback. For larger scale, benchmark and migrate to private Broadcast invalidations.
- Supabase security advisor still reports existing definer-function advisories and closed-by-default tables without policies; new public support RPCs are SECURITY INVOKER with guarded private implementations. These advisories are not a certification of unrelated legacy endpoints.
- Existing leaked-password protection is disabled. Review [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) before broader rollout. No authentication setting was changed in this task.
