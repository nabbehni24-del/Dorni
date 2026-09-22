# Owner workspace rollout — 2026-09-22

## Implemented

- Drawer identity uses persisted profile name and real account identity/counts.
- Settings grouped by account, contacts, vehicles/cards, notifications, sessions, language and deletion review.
- Profile name update persists both profile and existing Auth display metadata so login provisioning cannot overwrite it.
- Vehicle edit, archive/restore; card owner pause/resume, move to another owned unassigned active vehicle, permanent retirement and subsequent replacement through existing claim flow. No hard-delete and assignment history is preserved.
- Support creation with validated optional vehicle/card/report links; owner history and thread replies. Internal messages never returned to owners. Closed/resolved tickets reject replies. Ten new tickets per account per day.
- `/support` staff inbox uses existing active SUPER_ADMIN/SUPPORT/OPERATIONS membership, never browser claims or editable metadata. Staff can reply, add internal notes and update status. No staff access was granted in this rollout. Replies are read in the support UI; no new push-on-support-reply behavior.
- Session listing exposes current-session flag and timestamps only. Other-session sign-out uses Supabase Auth scope `others`. Existing access JWTs can remain valid until expiry in older API paths; workspace and push RPCs verify Auth session existence.
- Versioned help content; legal panel reads latest published Arabic TERMS/PRIVACY rows from existing terms_versions. No legal documents currently published. No invented agreement or consent is recorded.
- Notifications render the existing PushSettings component unchanged. No VAPID, worker, subscription, queue or notification preference changes.

## Database and endpoints

Hosted migration `owner_workspace` targets ONLY Dorni Production `ppflwbwnxxmfzdfckhlk`. SQL source: `supabase/sql/owner_workspace.sql`. CLI migration creation failed on Windows cache permissions; no invented timestamp migration filename.

Adds only codes.owner_paused, support WAITING_FOR_USER status and support indexes. Reuses all existing entities. Direct profile updates, vehicle updates/deletes and ticket/message writes are revoked from authenticated; validated private RPC owns these operations. Public RPC is security invoker; private definer verifies session, active profile and ownership, uses empty search_path and logs mutations without message bodies.

- GET/POST `/api/owner`: overview/messages/staff inbox and allowlisted mutations.
- POST `/api/owner/sessions`: confirmed sign out of other sessions.
- Existing `/api/support` now routes creation through the same validated RPC.
- Existing `/api/me` now includes full_name.

## Explicit release boundaries

This is a functional subset of the broad supplied specification, not completion of every proposed feature:

- Login remains email/password. No phone authentication change, SMS OTP or WhatsApp verification without configured providers. No nonfunctional channel toggles.
- Email identity change and new password reauthentication flows are not implemented here.
- Arabic UI only. English needs an actual localization pass, not a persisted switch that leaves Arabic UI unchanged.
- Legal publication and material-version reacceptance enforcement await approved documents. No invented legal retention policy.
- Account deletion is a confirmed, deduplicated support REVIEW REQUEST only. It DOES NOT immediately deactivate, revoke cards, anonymize or erase the account. UI states this before both confirmations. Staff must verify identity and approve an operational/retention policy before a separate deletion implementation. A submitted request alone cannot trigger irreversible deletion. Users can pause their cards immediately using the existing settings action.
- Replacement means retiring old card and activating a new authentic card. Physical fulfillment/payment is support-assisted.
- No provider, billing, Equal ID, or existing push configuration changes.

## Verification

`supabase/sql/test_owner_workspace_rollback.sql` verifies profile persistence, cross-owner rejection, archive guards, pause/resume/move/retire, ticket link ownership, private note filtering, closed-ticket rejection, staff access rejection, deletion confirmation and unauthenticated rejection. All fixture changes are rolled back. Local tests assert security contracts and notification preservation; run lint, typecheck and production build before release.

