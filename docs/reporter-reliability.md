# Reporter reliability repair

The original submit RPC aggregated repeated reports within five minutes but discarded the new status-token hash. The API still returned that token, causing immediate 404 status links. Tests previously inserted reports directly and therefore missed this path.

The private `report_access_tokens` table now binds every submitted capability to its report and scanner session. Existing original capabilities are backfilled and preserved. Both old and new status RPCs resolve aliases; expired reports remain inaccessible. Already-issued broken links cannot be reconstructed because their hashes were never stored. Those reporters must rescan the card.

Client-generated 256-bit capabilities are persisted per pending attempt before submission. Retrying the same token and session returns the same report without incrementing duplicates or queueing notifications. A different session or report type cannot reuse it. Transaction advisory locks serialize identical retries and aggregation for the same code. Optional storage failure falls back to in-memory retries; it cannot guarantee recovery after reloading with browser storage disabled.

An opaque `live_topic` broadcasts an empty refresh signal after owner response, public support message or ticket status changes. No identity, token, vehicle record or message body is broadcast. The client always refetches authoritative capability-filtered data and ignores broadcast payloads. Database broadcasts are best effort and never roll back the actual saved response. Connected clients retain a 15-second fallback; disconnected clients poll every 5 seconds; hidden tabs pause reads and refetch on return. Eligibility is additionally refreshed at its server-defined deadline. Realtime still depends on network/service availability, not a zero-error guarantee.

UI distinguishes unavailable links from transient network failure, preserves the last known state offline, prevents stale request overwrite, aborts hanging reads, provides retry controls, support countdown, report reference and safe link copy. Public free-text messaging is intentionally not added: aggregated reporters share one support case, so private conversations must not be mixed into a shared thread.

Verification: 105 Node tests plus real database rollback integration tests, TypeScript, ESLint and production webpack build. The integration test calls the actual submission RPC twice, retries the second capability, confirms both links and old RPC access, verifies one notification and two capabilities, tests invalid session reuse/expiry and checks emitted empty realtime signals. No customer fixtures persist.

Database advisor INFO on private tables without policies is intentional deny-direct-access. Existing legacy security-definer warnings and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remain separate from this change.
