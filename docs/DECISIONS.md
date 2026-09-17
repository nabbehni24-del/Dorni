# Architecture Decisions

## ADR-001 — Modular monolith

Accepted. Dorni ships as one Next.js application with explicit modules for identity, codes, reports, notifications, partners, support and operations. Background delivery is isolated behind a job endpoint, but it shares the same domain and database. This keeps V1 observable and deployable without premature microservices.

## ADR-002 — Supabase PostgreSQL is the only system of record

Accepted. The previous SQLite/D1 demonstration was removed. Supabase provides PostgreSQL, phone authentication, private object storage and RLS. Render hosts the application runtime. All schema changes live in ordered SQL migrations.

## ADR-003 — Dorni exclusively issues codes

Accepted. Owners can only claim a physical card with a separate one-time secret. Partners may request batches. Internal staff with an explicit production role invoke the central Code Engine. Public tokens, claim secrets and serials are independent random values with uniqueness constraints.

## ADR-004 — Public reporting uses capability tokens

Accepted. Scanners remain anonymous. Public QR tokens address active cards; separate high-entropy status tokens authorize one report’s status page. Only token digests are stored for status and scanner sessions. Public responses are allowlisted and never serialize owner records.

## ADR-005 — Polling before Realtime

Accepted. The scanner status page polls because the update frequency is low and the capability-token model is simpler to secure. Supabase Realtime remains optional for the authenticated owner notification center.

## ADR-006 — RLS plus server authorization

Accepted. Exposed tables have RLS, explicit grants and ownership/organization predicates. Sensitive workflows use narrowly granted transactional RPCs with internal authorization checks. Server routes repeat authorization and keep the Supabase secret key out of clients.

## ADR-007 — Sensitive production exports are ephemeral

Accepted. Raw claim values exist only during batch generation and inside an authorized CSV in a private Storage bucket. The database stores digests. Downloads require an internal role, produce a short-lived signed URL and create an audit event.

## ADR-008 — Provider-independent notifications

Accepted. Reports create channel-neutral notification records. A dispatcher selects in-app, SMS, WhatsApp or future web push adapters. Development mocks are explicit and cannot operate in production.

## ADR-009 — No partner access to consumer identity by default

Accepted. Partners see their organization, batches, requests, members and aggregate operational metrics. Ownership/contact data is not linked into partner responses. Any future exception requires a separate permission and documented business/legal basis.
