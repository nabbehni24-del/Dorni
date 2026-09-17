# Notification System

The report transaction writes a notification intent to an outbox. A worker resolves owner preferences and verified destinations, then creates provider-neutral messages and provider-specific attempts.

## Routing

1. Always create an in-app notification.
2. Attempt preferred verified channel.
3. On retryable failure, retry with bounded exponential backoff and jitter.
4. After policy timeout or terminal failure, try the verified fallback channel.
5. Record attempt status separately from report status.

Channels: Web Push, WhatsApp, SMS, and future native push. Adapters receive an opaque destination reference and structured template payload. Development adapters write redacted outcomes only and refuse to start in production mode.

## Reliability

Idempotency key is `(reportId, notificationPurpose, channel, destinationVersion)`. Provider webhook events are signature-verified and deduplicated. Alert owner when no reliable channel remains configured.
