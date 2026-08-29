# Phase 02 — Meals + kitchen checkpoint

## Objective
Migrate the first operational meal slice from the audited reference into the Cloudflare/D1 rewrite without weakening cutoff, audit, enrollment, or kitchen-counting behavior.

## Implemented
- D1 `meal_configurations`, `meal_entries`, and append-only `meal_history` tables.
- Institution-scoped meal configuration with ON/OFF defaults and previous-day, same-day, or custom-offset cutoff strategies.
- Timezone-aware cutoff calculation using the institution timezone rather than browser/UTC date assumptions.
- Resident meal entries generated from active configuration while excluding dates before enrollment.
- Resident ON/OFF changes are server-authorized, ownership-checked, cutoff-checked, recorded in history, and audited.
- Resident choices update `original_state`, preserving the reference distinction between a resident baseline and a future administrator override.
- Admin kitchen view with per-meal and per-resident status.
- Kitchen demand treats only past/locked or explicit override states as confirmed; still-editable choices remain open rather than being prematurely counted.
- Responsive Meals/Kitchen frontend integrated into the real BoardOps navigation.
- Deterministic local Breakfast, Lunch, and Dinner configuration for manual testing.
- Unit tests for institution-timezone conversion, previous-day cutoffs, custom offsets, locking, and override semantics.

## Deliberately deferred
The following audited meal capabilities are not claimed complete in this checkpoint:
- admin meal override UI/command
- bulk presets
- guest meals
- leave workflow and its atomic meal mutations
- financial restrictions on booking
- holiday/calendar effects

Those remain later operational slices. Financial restrictions are intentionally deferred until the canonical financial/ledger model exists; no temporary weaker accounting implementation is introduced here.

## Reference behavior preserved
The source kitchen counts demand only when a choice is confirmed by cutoff/locking or an administrator override. The rewrite keeps that distinction: an unlocked resident selection remains visible as an open choice and is not yet kitchen demand.

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

At the 2026-08-29 checkpoint, use `2026-08-30` for resident toggle testing because the seeded Breakfast cutoff is 22:00 on the previous day and Lunch/Dinner have same-day cutoffs.

## Verification
Feature commit `11045b3b72c509fcba8f381aeb87704c89111ac6` passed CI run `33251967877`: frozen installation, TypeScript, unit tests, build, D1 migrations, Worker startup, `/health`, and `/ready`.

## Status
CHECKPOINT COMPLETE — Phase 02 continues. Meals/kitchen core is testable; the deferred operational meal capabilities above are not yet complete.
