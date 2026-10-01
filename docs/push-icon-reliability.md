# Push state and launcher icon correction — 2026-10-01

- Preserved the supplied glyph aspect ratio, removed its baked-in rounded preview outline, and generated a separate Android maskable icon. Its glyph fits within the central 40%-radius safe circle. Manifest/Apple icon revision is brand6; app identity and scope remain unchanged.
- Notification state now distinguishes unavailable verification from disabled subscription. It rechecks on foreground, online, focus, and once per visible minute. No subscribe/unsubscribe occurs on mount, backgrounding, or closing.
- Explicit enable replaces an inactive server-bound endpoint instead of reusing a potentially expired push-provider endpoint. Subscription success is confirmed with a server status read.
- Session-bound delivery, logout revocation, and permission prompts remain unchanged. No database or auth policy changes.

## Evidence and limits

- Production aggregate diagnostics showed both active/live subscriptions and disabled subscriptions; older provider 410 responses exist. This does not identify the user's particular device or establish its exact cause.
- 116 tests pass, including mocked component close/reopen, unavailable network/recovery, explicit stale-endpoint renewal, missing subscription, and pixel-level maskable safe-zone validation.
- TypeScript, ESLint and webpack production build pass.
- Physical Android background delivery and launcher icon refresh require device confirmation. Browser/PWA storage separation, force-stop, OS restrictions, uninstall or clearing site data cannot be fixed by presenting a false enabled state. Do not claim guaranteed delivery from a successful enqueue.

References: https://web.dev/articles/maskable-icon and https://developer.mozilla.org/en-US/docs/Web/API/PushManager/getSubscription
