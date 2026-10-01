# Dorni public landing page

Static Arabic RTL website, deployed separately from the application from the `landing-page` branch. No build tooling, dependencies, form submissions, customer data, API writes or credentials are required.

## Run and test

`python -m http.server 4189 --bind 127.0.0.1`

`node --test tests/site.test.mjs`

## 2026-10-01 redesign

- Dorni's current supplied identity; lightweight HTML/CSS demonstration instead of old screenshots and multi-megabyte illustrations.
- Four user-driven stages: scan, report, owner response, support. Explicitly educational; no real report, call, ticket or QR token. Shows immediate escalation availability on the owner unavailable response, not automated calling.
- Actual app links for login, vehicles, installation, support, legal documents and partner workspace. Removed fake activation modal and unverified email addresses from the rendered page.
- No pricing, countries, coverage claims, invented customers, delivery promises or competitor graphics/text. The reference informed the idea of interactive stages only.
- Accessible tabs with RTL arrow keys, Home/End, radio controls, native FAQ disclosures, Escape mobile-menu close, reduced-motion support and visible focus indicators.

Reference supplied by user: https://qrcar.app/order-now and its linked home-page walkthrough. Original copy and layout, no third-party asset reuse.

Legacy assets remain in git for recovery, but `index.html` only loads `site.css`, `site.js`, optimized current wordmark and current icon.

## Verification

- Five static tests pass: references, local assets, app destinations, excluded content, and non-mutating demo.
- Browser walkthrough verified reason selection, send, owner-unavailable response, escalation, and honest simulated result.
- All four stages tested at 320, 390, 768 and 1280 CSS pixels: exactly one visible panel, no horizontal page overflow, no missing images.
- Mobile menu and Escape, RTL keyboard tab navigation, and native FAQ behavior checked through the browser.
- Physical phones and real production report delivery are outside this marketing-page demo; no real reports were created.
