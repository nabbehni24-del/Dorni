# Dorni admin control plane

## Purpose

Dorni uses one `SUPER_ADMIN` account as the control plane for the production application. A normal customer or partner account never receives administrative permissions from browser state or profile metadata. Authorization is checked in Postgres through `internal_memberships`, and every sensitive mutation is checked again by its API route.

## Creating the first administrator

1. Create or sign in to the ordinary Dorni email/password account that will belong to the platform owner.
2. Open `/admin/setup` while that account is signed in.
3. Enter the one-time `DORNI_BOOTSTRAP_TOKEN` stored only in Render.
4. The database grants `SUPER_ADMIN` only if no active internal membership exists. Later bootstrap attempts are rejected.

The administrator subsequently signs in through the same `/login` page as other users. Account context routes that account to `/admin` automatically. Never expose the bootstrap token to client configuration or commit it to Git.

## Partner approval lifecycle

- A company or distributor may submit a registration request after confirming its email.
- The organization is created as `PENDING` with direct code generation disabled.
- Its manager can enter the partner portal and see the review state, but cannot generate codes or submit a batch request.
- The super admin reviews the account identity and registration number, then approves, rejects, or suspends it.
- Approval may optionally grant trusted direct code generation and a daily limit.
- Existing production partners are not changed by the migration.

## Administrator capabilities

- Review, approve, reject, and suspend companies and distributors.
- Set each partner's daily generation limit and direct-generation privilege.
- Create a partner organization and bind an existing manager or issue an expiring email-bound invitation.
- Review partner batch requests and record the decision.
- Generate production batches and secure temporary export files.
- Monitor user, code, active-report, support-ticket, and failed-notification totals.
- Inspect recent reports, support tickets, production batches, and immutable audit events.
- Sign out without exposing administrative secrets to the browser.

## Security boundaries

- Admin APIs require `SUPER_ADMIN`; the matching database functions repeat the same check.
- Security-definer functions set an empty search path and use schema-qualified objects.
- Function execution is revoked from `public` and `anon` and granted only to authenticated users; role checks still decide whether the call succeeds.
- Partner batch-request RLS requires active membership in an active organization.
- Approval decisions and organization creation are written to `audit_logs`.
- The admin UI never receives service-role keys, database passwords, or the stored bootstrap-token digest.

## Recommended next controls

Before onboarding staff beyond the single owner account, add MFA for the administrator, a second-person approval rule for large code batches, export download alerts, and a documented emergency account-recovery procedure. Do not create additional internal roles until their exact permissions and audit requirements are defined.

