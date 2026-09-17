# Data Model

## Identity and ownership

`users` holds a person identity; `owner_profiles` enables consumer ownership. `contact_methods` and `notification_preferences` are separate from the authentication phone. `sessions` and `otp_challenges` store only digests and expiry/attempt state. A person may also have partner memberships.

`vehicles` belong to an owner and are soft-archived. Public presentation is produced by an explicit allowlisted projection.

## Codes

`code_batches` → `codes` → `code_claims`, `code_assignments`, and `code_replacements`. A partial unique constraint allows only one open assignment per code and per vehicle policy. Public token and serial are unique. Claim secret digests are unique and nullable after consumption.

State dimensions:

- Production: `PROVISIONED → PRODUCED → IN_STOCK → DISTRIBUTED`
- Claim: `UNCLAIMED → CLAIMED`
- Activation: `INACTIVE → ACTIVE ↔ SUSPENDED → REVOKED | REPLACED`

## Reports

`report_types` configure localized labels and severity. `scanner_sessions` are short-lived privacy-aware records. `reports` reference the code and vehicle snapshot; `report_events` are append-only. `notification_messages` represent routing intent and `notification_attempts` represent provider calls.

Report state: `CREATED → ACTIVE → ACKNOWLEDGED → RESOLVED | EXPIRED`; abuse may produce `BLOCKED` before notification.

## Partners and operations

`partner_organizations`, `partner_memberships`, and `partner_batch_requests` provide tenant boundaries. Support messages distinguish external replies from internal notes. `audit_logs` are append-only safe metadata, never secret material.

## Important indexes

Unique: normalized phone, code public token, code serial, claim digest, status token digest, batch code. Query indexes: active reports by vehicle/time, attempts by message/status, codes by batch/states, partner membership by user/org, and audit events by entity/time.
