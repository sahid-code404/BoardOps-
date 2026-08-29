# Phase 02 — Calendar & holiday rules checkpoint

## Objective
Migrate the institution calendar/holiday capability and close the previously deferred meal-calendar dependency without introducing temporary billing or financial behavior.

## Implemented
- Institution-scoped typed calendar events: Holiday, Festival, Special Meal, Billing Day, Refund Day, and Maintenance.
- Authenticated calendar read access for residents and administrators.
- Administrator create, edit, and soft-archive workflow with audit events.
- Meal-service closure rules backed by D1 rather than UI-only state.
- Active meal-disabling events cannot overlap, keeping application/reversal deterministic.
- Existing materialized meal entries are forced OFF + locked when a closure is published while preserving their prior state in `calendar_meal_effects`.
- Meal entries materialized later during a closure are also forced OFF + locked.
- Archiving a closure restores only still-editable meal entries whose original resident intent was not changed by another authoritative workflow such as approved leave.
- Meal toggle, preset application, administrator override, and guest-meal creation return a friendly 422 when the selected date is closed by the institution calendar.
- D1 triggers act as a second enforcement layer so direct write paths cannot re-enable or unlock meal service during an active closure.
- Creating a closure fails if active guest meals already exist in the affected range; the administrator must cancel them explicitly instead of silently losing guest demand.
- Responsive Calendar UI for residents and administrators, including filters, upcoming-event KPIs, meal-closure badges, edit controls, and archive controls.

## Source behavior preserved and improved
The audited source holiday API supported typed events, date ranges, a `mealsDisabled` flag, updates, and soft archival. The rewrite preserves that product intent while adding institution scoping and making meal impact authoritative.

Meal-impacting date/flag changes are intentionally immutable after publication. An administrator must archive the existing meal-impacting event and create a corrected event. This lets the rewrite reverse recorded meal effects safely instead of silently recalculating history.

## Deliberately deferred
- notifications/outbox delivery for calendar changes
- announcement integration
- billing/refund-day financial actions
- financial restrictions and policy enforcement

Calendar event types that reference billing/refund operations are informational only until the canonical financial phases exist. No placeholder financial posting occurs.

## Local verification
```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

Resident: `arjun@boardops.local`  
Admin: `admin@boardops.local`  
Password: `boardops-demo`

The deterministic seed includes:
- `2026-09-01` — Festival Dinner (Special Meal, service remains enabled)
- `2026-09-02` — Founders Day (Holiday, meal service disabled)
- `2026-09-04` — Kitchen Deep Clean (Maintenance, service remains enabled)

For the clearest end-to-end test, sign in as the resident and open Meals for `2026-09-02`; meal entries should materialize OFF + locked. Then sign in as administrator, open Calendar, archive Founders Day before the relevant cutoff, and verify still-editable resident choices are restored to their pre-event state.

## CI verification
Implementation commit `0951616fcd5aa3e239b03ace8ac5d277243ccc32` passed CI run `33253332771`.

The run passed frozen dependency installation, TypeScript checks, unit tests (including calendar range/overlap rules), the production build, every local D1 migration including `0005_calendar_rules.sql`, Worker startup, `/health`, and `/ready`.

## Status
CHECKPOINT COMPLETE — institution calendar/holiday management and authoritative meal-service closure rules are implemented and CI-verified. Notifications and financial calendar effects remain deliberately deferred.
