# Implementation Plan

## Completed foundation

- Standard Next.js production runtime and Render Docker blueprint.
- Supabase SSR session handling and phone-OTP endpoints.
- PostgreSQL migration for owners, contact methods, vehicles, partners, batches, codes, claims, assignments, reports, events, notifications, support, legal acceptance, internal roles, abuse and audit.
- RLS, explicit Data API grants, tenant isolation helpers and transactional RPCs.
- Owner application with account overview, vehicles, real card claim, alerts, responses, guide, settings and support ticket creation.
- Anonymous public scan, optional location, duplicate aggregation and expiring status capability.
- Partner portal with organization context, requests, batch status and aggregate counts.
- Admin operations overview, partner creation, central batch generation and private production exports.
- Notification router with in-app delivery and configurable SMS/WhatsApp adapters.

## Integration milestone

1. Create a dedicated Supabase project in the selected organization.
2. Apply and verify the migration, then run Supabase security/performance advisors.
3. Configure Phone Auth and the selected Libya-capable SMS provider.
4. Create the first administrator through the one-time bootstrap flow.
5. Push the repository to a dedicated GitHub repository.
6. create the Render web service from `render.yaml`, set secrets, deploy and verify `/api/health`.

## Remaining production hardening before public launch

- Select and contract SMS/WhatsApp providers; provider credentials are a business dependency, not a mockable production choice.
- Add CAPTCHA escalation and distributed edge rate limiting for public report traffic.
- Schedule the notification dispatcher and report/location expiry jobs.
- Add admin MFA enrollment and sensitive-action reauthentication.
- Add Playwright E2E against the Supabase staging project, including concurrent claim tests.
- Add production export cleanup and download reconciliation.
- Complete Arabic legal copy with counsel and publish version 1 acceptances.
- Operational runbooks, alerting, backups, incident response and penetration test.

Mocks are permitted only in local development and never silently activate in production.
