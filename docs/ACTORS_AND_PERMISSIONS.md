# Actors and Permissions

## Boundaries

| Actor | Authentication | Data boundary | Key actions |
|---|---|---|---|
| Scanner | Anonymous report capability | One active public code and one report status token | Submit structured report; read its status |
| Owner | Verified email/password session | Own profile, vehicles, assignments, reports | Manage vehicle/contact data; claim code; respond |
| Partner applicant/member | Verified email/password plus organization membership | One organization | View approval state; after approval request/view batches and allowed exports |
| Dorni super admin | Verified email/password plus active `SUPER_ADMIN` membership | Platform control plane | Approve/suspend partners; manage code production; monitor operations and audit |

## Partner roles

- `PARTNER_ADMIN`: team membership, batch requests, allowed exports, metrics.
- `PARTNER_OPERATOR`: batch requests and operational batch views.
- `PARTNER_VIEWER`: read-only batches and aggregate metrics.

Every partner query includes the organization identifier from the verified membership context. Client-supplied organization identifiers are never trusted for authorization.

## Internal permissions

The current operating model deliberately enables one `SUPER_ADMIN` account. Sensitive API routes and database functions both enforce that role. Partner applicants are created as `PENDING`; only the super admin can activate, reject, or suspend them, enable trusted generation, and set daily limits.

The first administrator is promoted once through `/admin/setup` with the server-only bootstrap token. Later bootstrap attempts are refused. The administrator then uses the normal email/password login and is routed to `/admin`. MFA and step-up authentication are recommended before adding more staff roles; they are not claimed as implemented today.

See `ADMIN_CONTROL_PLANE.md` for the operational workflow and security boundary.

## Public privacy rules

Public DTOs are allowlists. They may contain manufacturer, model, color, report label, and status timeline. They never contain owner/contact/user identifiers, plate, claim data, partner data, notification destinations, or raw ORM records.

