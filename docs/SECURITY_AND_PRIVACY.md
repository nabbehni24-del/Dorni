# Security and Privacy

## Threat model priorities

Photographed public QR codes, report spam, claim guessing/replay, tenant escape, insecure direct object references, export leakage, notification destination disclosure, admin credential abuse, and concurrency races.

## Controls

- 128+ bits of entropy for public/status tokens; 160+ bits for claim credentials.
- HMAC verification digests with separately managed pepper for one-time secrets.
- Secure, HttpOnly, SameSite sessions; CSRF protection for cookie-authenticated writes; rotation and revocation.
- OTP expiry, resend cooldown, bounded attempts, normalized E.164 `+218`, and layered rate limits.
- Server-side authorization on every owner, partner, and admin operation.
- Transactions and uniqueness constraints for claim, assignment, replacement, and batch issuance.
- Explicit public DTOs, output encoding, Zod validation, CSP, safe logs, encrypted storage, and secret redaction.
- Append-only audit for sensitive actions; audit metadata excludes tokens, OTPs, claims, exact location, and contact destinations.

## Retention defaults

Exact optional location: delete after 24 hours or report resolution, whichever is sooner. Scanner status capability: 72 hours. Raw network signals: short rotating abuse windows. Notification attempt metadata: operational retention without message destination plaintext. Legal acceptance and audit records follow documented regulatory retention.

## Required launch reviews

Privacy/legal review for Libya and every operating market, provider template approval, recovery and breach playbooks, dependency/SAST scans, access-control tests, race tests, rate-limit load tests, RTL/accessibility review, and independent penetration testing.
