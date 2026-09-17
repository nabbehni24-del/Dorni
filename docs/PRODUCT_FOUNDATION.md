# Dorni Product Foundation

Dorni is a privacy-first relay between a person near a vehicle and its owner. The public experience never exposes the owner, their contact destinations, account identifiers, or private vehicle data.

## V1 outcomes

1. A scanner can submit one structured vehicle-related report without an account.
2. An owner can authenticate by verified phone, manage vehicles and contact methods, claim a Dorni card, receive a report, and send a structured response.
3. A partner can request centrally issued batches and see only organization-scoped operational aggregates.
4. Dorni operations can issue, investigate, suspend, revoke, replace, and audit codes and reports.

## Architecture

A modular monolith is the deliberate V1 boundary. The browser applications are separate route areas over one typed server application and one relational store. Modules own their rules and expose use-cases rather than tables: Identity, Owners, Vehicles, Codes, Reports, Notifications, Partners, Support, Abuse, Legal, and Audit.

Asynchronous work uses an outbox and idempotent job handlers. Notification provider adapters never decide business policy. Public responses use purpose-built DTOs. Cross-module writes happen through explicit application services and transactions.

## Non-goals

No public chat, owner directory, social graph, advertising platform, commerce suite, fleet ERP, or partner access to consumer identities. A production OTP or messaging provider is an adapter and deployment concern, not embedded business logic.

## V1 improvement decisions

- A report is a case; notification delivery is a separate process. Delivery failure does not rewrite report state.
- A code has independent production, claim, and activation dimensions. This avoids an invalid mega-enum.
- Current assignment is derived from an open-ended assignment history record, preserving every move and replacement.
- Claim secrets are stored only as keyed verification digests and disappear after consumption.
- Partner reporting is aggregate-only by default; exceptional personal-data access is not a V1 feature.
- Anonymous status capability tokens are report-scoped, hashed at rest, short-lived, and revocable.

## Definition of done boundary

The repository contains the foundation, representative application surfaces, secure domain contracts, database design, and local mocks. Production launch still requires real provider credentials, legal review, operational runbooks, penetration testing, and deployment-specific rate-limit storage.
