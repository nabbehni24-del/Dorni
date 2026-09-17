# Architecture Decision Record

## ADR-001: Modular monolith

Accepted. One deployable keeps transactions, authorization, and operations simple; modules preserve future seams.

## ADR-002: PostgreSQL target, SQLite-compatible hosted demonstration

Accepted. PostgreSQL is the production system of record. The hosted product demonstration may use D1 for bounded workflow state, but domain SQL avoids pretending the two engines have identical concurrency semantics.

## ADR-003: Separate state dimensions for physical codes

Accepted. Production, claim, activation, distribution, and assignment history are independent.

## ADR-004: Capability tokens for anonymous status

Accepted. A scoped expiring token is simpler and safer than anonymous identity accounts.

## ADR-005: Polling over WebSockets

Accepted. Conditional polling meets latency needs and reduces infrastructure and privacy surface.

## ADR-006: Provider-neutral notification orchestration

Accepted. Policy is owned by Dorni; WhatsApp/SMS/push adapters only deliver.

## ADR-007: No partner consumer PII in V1

Accepted. Batch provenance does not grant personal-data access.

## ADR-008: Arabic-first UX with Libyan wording

Accepted. Arabic strings are authored naturally, RTL is the base layout, and enum/state identifiers remain stable and localized at presentation time.
