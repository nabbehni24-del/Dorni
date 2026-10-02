# Dorni public landing page

Static Arabic RTL site at https://dorni-landing.onrender.com/, deployed independently from the application on the `landing-page` branch. No framework, runtime package dependency, database, email service or third-party analytics provider is added.

## Run and verify

`python -m http.server 4189 --bind 127.0.0.1`

`node --test tests/site.test.mjs tests/analytics.test.mjs tests/contact.test.mjs`

## 2026-10-02 conversion improvements

- Preserved original hero message, logo, icon, illustrations, orange/navy identity and original `style.css`. Brand orange remains #FF5A22; navy foreground text supplies contrast on bright orange buttons and sections. Extensions live in `conversion.css`.
- Added four everyday parking situations after the hero and a short transition to the existing three-step explanation.
- Kept the navy section and illustrated owner. Added balanced sender/owner journeys and only supported responses: on the way, resolved, cannot reach.
- Kept the educational four-stage walkthrough, now optionally expandable after the two journeys. Existing #walkthrough links auto-expand it. No real report, ticket, call or QR token is generated.
- Strengthened privacy with a sender → Dorni → owner diagram and temporary follow-up link explanation, without an encryption claim.
- Added #get-dorni: request information, agree details, then activate the acquired card. Purchase and activation are separate in header, mobile menu, hero, FAQ and final CTA.
- Strengthened businesses section while preserving #business and existing /partner route. Requests concern employee cards, company vehicles and possible limited trials, without asserting sales terms or outcomes.
- Expanded FAQ to 12 questions, checked against application owner-message guidance. Kept #how, #privacy, #app, #faq, #activate and application destinations unchanged.
- No final product image, service duration, price, payment flow, country list or coverage claim is presented. Founder will approve product artwork and commercial terms later.

## Contact behavior (important)

Approved recipient: **dorni.2026@gmail.com**.

Individual request opens a mailto draft. Company form prepares a draft locally, then exposes a separate mailto link. The visitor must review and press Send in their email application. Nothing is submitted directly by the website, and delivery is not confirmed. A visible address is provided if no mail client is configured. Changing company fields hides the stale draft. The form's submit button stays disabled without JavaScript to prevent accidental default GET submission.

The form contains company name and coarse quantity/use selections, not passwords, activation codes or payment details. No field value goes into analytics. No production/test email was sent during QA.

For true in-page submission and verifiable receipt later, add an approved server-side mail provider with spam protection and secret storage. A Gmail address alone is not an outbound email API credential.

## Event layer

`assets/analytics.js` provides `window.DorniAnalytics`, a provider-neutral layer. Events stay in a bounded in-memory queue (100 max); no network, cookies, visitor IDs, URL/referrer collection, localStorage or sessionStorage. Reload clears them. This is readiness for analytics, **not a reporting dashboard or persistent measurement service**.

| Event | Trigger |
| --- | --- |
| get_dorni_click | CTA to acquisition section |
| activation_click | Handoff link to existing app vehicle area; not completed activation |
| how_click | Explanation link |
| how_view | Explanation heading enters view; once per load |
| privacy_view | Privacy heading enters view; once per load |
| business_click | Business section/contact CTA |
| faq_open | FAQ opens; stable allowlisted FAQ ID |
| card_order_start | Individual email-draft link clicked; not an order confirmation |
| company_draft_prepared | Valid company form prepares local draft; not submitted |
| company_email_open | Company email-draft link clicked; not delivery confirmation |

Each event has `name`, allowlisted `properties`, and `version:1`. Only predefined location/FAQ values survive. Form values, arbitrary text and identifiers are discarded. Integration can subscribe to `dorni:analytics` or call `DorniAnalytics.setAdapter(fn)` after selecting a provider and arranging any required consent. No replay is automatic. `snapshot()` exposes a read-only copy for local debugging.

Reserved events `activation_start`, `activation_complete`, `company_form_submitted`, `card_order_complete` are defined but never emitted by the landing page. Connect them only to authoritative product/backend outcomes. Activations happen on a different origin and cannot be verified from this static page.

## Performance and search

- Existing street PNG 2,136,497 → WebP 284,924 bytes.
- Existing scanner PNG 763,541 → WebP 90,692 bytes.
- Existing notified person PNG 1,095,466 → WebP 112,340 bytes.
- Total for these illustrations: 3,995,504 → 487,956 bytes (~87.8% reduction).
- Original PNGs retained for reproducibility; browser loads WebP only. Below-fold person and privacy icon are lazy. Hero images have dimensions; scanner has high fetch priority and hero is not hidden awaiting a reveal animation.
- Existing Google font uses display=swap and preconnect. No additional font/library/tracker.
- Movement respects prefers-reduced-motion. Optional walkthrough reduces default mobile page length.
- Updated Arabic title/description, canonical, OG locale/title/description/image, Twitter card, existing real icon as favicon, robots.txt and sitemap.xml.
- 1200×630 sharing image is composed from existing logo/illustrations, not a product image. Rebuild with `node scripts/optimize-assets.cjs <path-to-existing-sharp>`.
- No field Core Web Vitals or throttled Lighthouse score is claimed. Real LCP/INP/CLS require production measurements on representative devices; actual field data is not available here.

## Verification

14 Node tests pass (links/anchors, assets, destination constraints, no unsupported claims, layout sections, separate CTAs, SEO, analytics privacy/bounding, draft encoding and invalidation). JavaScript syntax checks pass.

Browser checks: 320, 360, 390, 430, 768, 1280 CSS px × all four panels (24 combinations), one visible panel and no horizontal page overflow. Checked educational owner-unavailable response, company draft creation and invalidation, correct approved recipient, FAQ expansion and mobile navigation. No production records created.

## Language selector

The landing page supports formal Arabic (`ar`), Libyan Arabic (`ar-LY`, default), and English (`en`). Header and mobile-menu selectors show a local SVG flag and a written language name. Switching is immediate, updates text, accessibility labels, interactive-demo messages and email drafts, and changes RTL/LTR direction. Only the chosen locale is saved in localStorage (`dorni.landing.language`); no translation service or tracking was added. This preference is for the landing page, not the separate application.

Language verification: all 16 tests pass with `node --test tests/site.test.mjs tests/analytics.test.mjs tests/contact.test.mjs tests/language.test.mjs`. Browser checks covered all three languages at 320, 390, 1024 and 1280 CSS pixels with no horizontal overflow; English remained selected after reload.

## Founder decisions remaining

Product photograph/design, approved service duration and commercial terms, optional actual mail submission provider, and eventual analytics provider/consent model. None were invented or silently enabled.
