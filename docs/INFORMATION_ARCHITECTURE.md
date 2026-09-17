# Information Architecture

## Public

- `/` and `/t/:publicToken` — validate card, confirm minimal vehicle, choose reason, optionally share location, submit.
- `/status/:statusToken` — private temporary report progress.
- `/claim` — authenticated card claim/redeem flow.

The first viewport contains the vehicle confirmation and report choices. Location permission is requested only after an explicit action.

## Owner application

Bottom navigation: `بياناتي`, `التنبيهات`, `سياراتي`. Account overview is a useful home, not a duplicate profile form. Secondary drawer: support, how-to, terms/privacy, settings, logout.

## Partner portal

Desktop navigation: Overview, Batches, Codes, Analytics, Team. Partner users see organization-scoped operational data and aggregates only.

## Dorni admin

Desktop navigation: Operations overview, Codes & Batches, Partners, Reports & Delivery, Support, Security & Abuse, Audit, System. Screens are task-oriented queues and detail views, not raw table CRUD.

## Localization

Arabic is the source locale and default direction. English is a future parallel catalog. Domain enum codes remain language-neutral; labels come from versioned localization/configuration records.
