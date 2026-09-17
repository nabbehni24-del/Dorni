# DORNI | دورني

Dorni is a privacy-first vehicle communication platform. A person scans an official Dorni card, selects a structured reason, and Dorni relays the alert without exposing the owner’s identity or contact details.

## Applications

- `/t/:token` — anonymous, mobile-first scanner experience
- `/status/:token` — temporary report status capability
- `/login` and `/app` — phone-OTP owner application
- `/partner` — organization-isolated partner portal
- `/admin` — permission-gated Dorni operations console

## Stack

- Next.js 16 / React 19 / TypeScript
- Supabase Auth, PostgreSQL, Storage and Row Level Security
- Tailwind CSS and accessible UI primitives
- Render Docker deployment
- Modular monolith; no microservices

## Local setup

1. Copy `.env.example` to `.env.local` and fill the Supabase project values.
2. Apply `supabase/migrations/20260917173000_dorni_foundation.sql` to a clean Supabase project.
3. Enable Phone Auth and configure an SMS provider in Supabase.
4. Run `npm ci`, then `npm run dev`.
5. Sign in using the phone set in `DORNI_BOOTSTRAP_PHONE`, then call `POST /api/admin/bootstrap` once with `DORNI_BOOTSTRAP_TOKEN` to create the first internal administrator.

Development notification mocks require `DORNI_NOTIFICATION_MODE=mock` and are rejected when `NODE_ENV=production`. Production provider mode never silently falls back to a mock.

## Quality gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Security boundaries

- The browser receives only the Supabase publishable key. The secret key stays server-only.
- Public scanner APIs return explicit allowlisted DTOs.
- Claim credentials are high-entropy, stored only as digests, single-use and transactionally consumed.
- Owners never mint authoritative codes. Only the internal Code Engine can create a batch.
- Partner access is organization-scoped in RLS and server checks.
- Production exports live in a private bucket and are exposed only with short-lived signed URLs.
- Important code, partner, report and export operations write audit events without secrets.

See `docs/` for the domain model, permissions, state machines, notification routing and rollout plan.
