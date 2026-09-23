# Interface languages — 2026-09-23

Three interface choices: formal Arabic (`ar`), English (`en`), and Libyan Arabic (`ar-LY`). Shared terms intentionally remain identical between Arabic variants; conversational messages have distinct formal/Libyan wording.

## Scope

Translated: owner home, navigation, vehicles/cards, alerts, settings, support UI, help, account/privacy explanations, confirmation dialogs, notification settings, login/registration/reset password, installation, scan/report status and partner portal. Existing owner-header and drawer logos navigate to account home without calling logout.

Not translated automatically: customer names, vehicle descriptions, support messages, IDs, approved legal document bodies. Published Arabic legal content retains its explicit Arabic direction. The marketing landing page and internal admin console remain outside this customer-interface pass. Existing operating-system push payloads, service worker fallback copy and auth emails remain unchanged; this UI preference is not a server-side notification-language setting.

## Storage and rendering

`components/locale-provider.tsx` persists `dorni.locale` in browser localStorage, synchronizes other tabs, validates supported values and changes document language/direction. Preference is per browser/device, not a profile database field. Blocked storage does not prevent a session language change and shows a persistence warning. Server and first client render default to Libyan Arabic; the saved preference is restored after hydration. No session, subscription, API request payload or user data is changed.

`lib/owner-messages.ts` contains authored interface and known API-error translations. Interpolated counts/limits use named placeholders. Unknown text is preserved rather than translated through an external service. Dates use the selected locale; identifiers, email and codes retain LTR. User content must not be passed to the interface translator.

## Adding copy

Add English, formal Arabic and Libyan variants in the message catalog. Use `useLocale().t` for interface text only, including accessible names and dynamic labels. Keep API action codes and confirmation payloads locale-independent. Avoid translating customer-supplied messages. Do not remount forms or reload the page when switching languages.

## Verification

Unit and server-render tests cover three-language selection, English LTR rendering, formal/Libyan differences, interpolation, unmodified user data, storage contract, logo navigation and existing functional/security regressions. These are not a substitute for real-device visual acceptance. Before claiming full visual QA, check 360px/390px widths, light/dark, long English labels, open dialogs, draft retention, persistence after reload, and push activation remaining unchanged.
