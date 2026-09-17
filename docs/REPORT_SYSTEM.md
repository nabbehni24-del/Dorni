# Report System

A report captures one structured reason against the code and vehicle active at submission time. It never accepts anonymous free text.

## Submission policy

Validate active code, public DTO, report type, scanner capability, coarse rate limits, per-code cooldown, duplicate key, and abuse score. Escalate to CAPTCHA only when risk requires it. Location is optional, precision-limited, and retained for the shorter of report expiry or the configured safety window.

The duplicate key combines code, report type, a rotating privacy-safe scanner signal, and a time bucket. Same-scanner duplicates return the existing status capability. Independent reports in the aggregation window increment an aggregate count and produce at most one owner notification update.

## Timeline

Append-only events include created, validated, notification dispatched/delivered, owner opened, owner on the way, cannot reach, resolved, expired, and blocked. Scanner presentation maps only allowed events to human status text.

## Status capability

The response returns a random high-entropy token once. Only its digest is stored. It is report-scoped, non-enumerable, rate-limited, and expires. Polling with conditional responses is the V1 transport; WebSockets add no required value.
