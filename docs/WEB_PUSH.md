# Dorni Web Push — implementation and operations

## Architecture

- `/api/push` authenticates the user using Supabase Auth, then calls `push_device`.
- Device bindings are private, tied to both user ID and a live Auth session. Endpoint ownership is never accepted from a client-supplied user ID.
- A new `IN_APP / REPORT_CREATED` notification transactionally creates one `private.push_jobs` row per active subscribed device. Existing reports are not replayed. Reports aggregated by the existing 5-minute policy do not create another alert.
- `pg_net` wakes the `dorni-push` Edge Function after commit. A `pg_cron` job checks due/recoverable work once per minute. Neither depends on Render staying awake.
- Worker calls require a dedicated secret bearer token. Gateway JWT verification is disabled ONLY because the handler performs this custom authentication; its database RPCs are service-role-only.
- VAPID private key and worker token are stored in Supabase Vault. No secrets are checked into Git or returned to browsers. The public VAPID key is returned to authenticated clients.
- Web Push uses `web-push@3.6.7`, standard encryption, generic Arabic notification content and a fixed same-origin click destination `/app?tab=alerts`.

## Delivery semantics

- `SENT` means the push provider accepted the request, **not** that the phone displayed or the user read it.
- At-least-once processing, max 5 attempts, 2-minute lease, fencing token, bounded exponential retry, 1-hour job expiry. An ambiguous network failure can duplicate delivery; stable notification tags reduce duplicates, but do not guarantee exactly-once delivery.
- 404/410 disables the subscription. 429/5xx/network errors retry. Other 4xx fail and require inspection.
- The worker accepts only known HTTPS browser push domains; redirects are not followed by the library. Invalid endpoint submissions are rejected in SQL and revalidated before sending.
- Logging out disables that session's bindings. Jobs are cancelled if subscription owner/session changes, the session disappears, or the report is no longer active. A request already handed to a push provider cannot be recalled.
- Ten active subscriptions per account. Test notifications are limited to one per minute per subscription. This limit does NOT restore the scanner cooldown removed earlier.
- Minimal new tables have RLS enabled with no direct user access by design. Narrow private definer functions enforce ownership; public wrappers are invoker functions.

## Deployment state / checks (2026-09-22)

- Applied named hosted migration `dorni_web_push` on **Dorni** (`lgpnadulbcnqmgqosxni`); Equal ID untouched.
- `supabase/sql/dorni_web_push.sql` records the migration. Local CLI failed to initialize its Windows settings directory; hosted migration tool was used instead.
- Edge Function deployed. An authenticated empty worker invocation returned HTTP 200 with zero processed jobs; invalid bearer returned 403.
- Permission checks: anonymous/signed-in users cannot read worker secrets; only service_role can. Anonymous users cannot register a device.
- Rolled-back database integration test passed (see `supabase/sql/test_web_push_rollback.sql`). It uses a transaction-local synthetic Auth session and persists no data or network requests.
- 27 local tests passed, along with lint, TypeScript and production build.
- Security advisors reported no new exposed push function warning. Private push tables' no-policy notices are deliberate deny-by-default. Older public definer function warnings and leaked-password protection warning remain outside this change. See [Supabase advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Required device acceptance (not yet completed)

1. Deploy frontend commit to Render. Open the installed app, sign in, menu → settings → enable this device's notifications.
2. Accept the OS/browser prompt. On iOS use an installed Home Screen app on a supported version (iOS 16.4+).
3. Press test and confirm a real OS notification, not merely the in-app queued acknowledgement.
4. Close the app and lock the phone; send a report from another device for your own test vehicle. Confirm notification and tap-through to alerts.
5. Verify Android and iOS separately, permission denial, offline recovery, logout, and switching accounts. Confirm the former owner receives no new push after logout.

Do not advertise device delivery as verified until this checklist passes. OS permission, Focus mode, connectivity, power management and subscription expiry can affect display and timing.

## Operations

Inspect aggregate `state`/`last_status` counts in `private.push_jobs` and Edge Function failures; never paste endpoint URLs or auth keys into tickets. The job body contains no scanner identity or vehicle details.

To pause sending without losing queued data: set `private.push_settings.enabled=false`. Cron only wakes for due work while enabled. Keep VAPID keys stable; replacing them requires devices to subscribe again. Secrets provisioning is a one-time Vault operation and is intentionally not included in the migration file.

Retention cleanup of old terminal jobs is not automated yet; review growth before scaling and add a retention job with an agreed window.

References: [Web Push library](https://github.com/web-push-libs/web-push), [Supabase scheduled workers](https://supabase.com/docs/guides/functions/schedule-functions).
