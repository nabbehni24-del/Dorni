# Actors and Permissions

## Boundaries

| Actor | Authentication | Data boundary | Key actions |
|---|---|---|---|
| Scanner | Anonymous report capability | One active public code and one report status token | Submit structured report; read its status |
| Owner | Phone OTP session | Own profile, vehicles, assignments, reports | Manage vehicle/contact data; claim code; respond |
| Partner member | Verified user plus organization membership | One organization | Request/view batches; manage team by role; view aggregates |
| Dorni staff | Separate hardened internal session | Permission-scoped operations | Issue/revoke/replace; support; audit; security review |

## Partner roles

- `PARTNER_ADMIN`: team membership, batch requests, allowed exports, metrics.
- `PARTNER_OPERATOR`: batch requests and operational batch views.
- `PARTNER_VIEWER`: read-only batches and aggregate metrics.

Every partner query includes the organization identifier from the verified membership context. Client-supplied organization identifiers are never trusted for authorization.

## Internal permissions

Roles are convenience bundles; permissions are the enforcement unit. Sensitive permissions include `APPROVE_BATCH`, `GENERATE_CODES`, `EXPORT_PRODUCTION_DATA`, `REVOKE_CODE`, `REPLACE_CODE`, `VIEW_OWNER_CONTACT`, `MANAGE_PARTNERS`, `MANAGE_SUPPORT`, `VIEW_SECURITY_EVENTS`, `VIEW_AUDIT_LOGS`, and `MANAGE_ADMIN_ACCESS`.

Admin authentication is isolated from consumer sessions, supports MFA, uses shorter idle limits, and requires recent authentication for production export, code reassignment, and admin-access changes.

## Public privacy rules

Public DTOs are allowlists. They may contain manufacturer, model, color, report label, and status timeline. They never contain owner/contact/user identifiers, plate, claim data, partner data, notification destinations, or raw ORM records.
