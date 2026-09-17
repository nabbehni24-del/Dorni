# Implementation Plan

## Milestone 1 — Foundation

Architecture, data model, permissions, state machines, public DTO rules, design tokens, localization, configuration, logging, and tests.

## Milestone 2 — Secure owner/code vertical slice

Mockable phone OTP, sessions, contact verification, vehicles, code generation, one-time claim, assignment, lifecycle, replacement, and audit.

## Milestone 3 — Public reporting

Fast public token lookup, report types, scanner/status capabilities, optional location, duplicate aggregation, abuse controls, and privacy tests.

## Milestone 4 — Delivery and response

Outbox worker, provider adapters, retries/fallbacks, owner inbox/detail, structured response, scanner polling, expiration, and history.

## Milestone 5 — Partner and operations

Organizations/memberships, batch policy/request/generation, secure export, aggregates, support, admin queues, RBAC, and audit investigation.

## Milestone 6 — Hardening and launch

E2E definitions of done, concurrency/load tests, production integrations, observability, backups/recovery, security/privacy/legal reviews, accessibility, deployment, and runbooks.

The first release does not include commerce, unrestricted chat, partner personal-data access, or microservices.
