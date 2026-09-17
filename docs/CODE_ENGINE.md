# Code Engine

Only the server-side Dorni Code Engine issues authoritative identities. Partners request or initiate according to policy; they never mint.

## Generation

1. Reserve a batch with quantity and an idempotency key.
2. Generate internal UUID, human serial, 128-bit public token, and independent 160-bit claim credential with a CSPRNG.
3. Store the public token and a keyed HMAC digest of the normalized claim credential. Never store routine-readable claim plaintext.
4. Insert under uniqueness constraints. Retry only the individual collision.
5. Mark the batch complete only when generated count equals requested count. Failed jobs remain resumable from committed count.

## Claim

Normalize credential → rate-limit → compute HMAC → lock matching unclaimed code → validate activation and batch policy → consume claim and create assignment in one transaction → emit audit/outbox events. A repeated or racing request sees an already-consumed credential and fails generically.

## Replacement

Replacement atomically closes the old assignment, marks the old code `REPLACED`, links both codes, assigns and activates the new code, and emits an audit event. The old public URL returns inactive behavior immediately.

## Production exports

Exports are encrypted objects with short-lived authorized download, creation/access audit events, and a one-time reveal policy. Claims never appear in logs, analytics, normal code detail, or browser telemetry.
