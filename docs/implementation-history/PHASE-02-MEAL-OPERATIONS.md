# Phase 02 — Meal operations checkpoint

## Objective
Complete the next operational meal slice without introducing temporary financial logic: resident presets, administrator post-cutoff overrides, guest demand, and an atomic leave-to-meal workflow.

## Implemented
- Institution-scoped meal presets with item-level ON/OFF intent.
- Resident preset application that changes only editable meals; locked meals are skipped and remain authoritative.
- Administrator meal overrides limited to active residents and locked/past-cutoff meal choices.
- Administrator overrides preserve `original_state`, require a reason, append `meal_history`, and append an audit event.
- Guest meal records with per-meal/date counts, optional name/notes, audit events, and soft cancellation instead of destructive deletion.
- Kitchen UI combines confirmed resident demand with active guest demand while keeping open resident choices separate.
- Resident leave application for all meals or selected meals.
- Administrator approve/reject workflow for leave applications.
- Approved leave applies all derived meal mutations in one D1 batch: existing changes are written to `meal_history`, all selected meal/date rows are upserted OFF + locked, the leave decision is persisted, and the audit event is appended atomically.
- Responsive UI for presets, guest meals, leave submission, leave review, and post-cutoff meal overrides.

## Source behavior intentionally improved
The audited source leave approval updated the leave first and then mutated meal rows one at a time while ignoring individual failures. That can produce a partially-applied approved leave. The rewrite follows the Phase 01 business-rule correction: the leave decision and all derived meal mutations succeed together or fail together.

Guest meal cancellation is also non-destructive. The source exposed deletion; the rewrite preserves the record and changes its operational status to `CANCELLED` so later accounting/audit work can retain history.

## Deliberately deferred
- financial restrictions on meal booking
- holiday/calendar meal disable rules
- notification delivery/outbox integration
- guest-meal pricing/revenue and billing effects
- full administrator meal-configuration CRUD UI

Financial behavior remains deferred until the canonical ledger, billing snapshot, and restriction model exist. No temporary balance or revenue calculation is introduced here.

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

The deterministic seed includes three resident presets and one pending leave application for Ananya Rao covering `2026-08-31` through `2026-09-01` so the admin approval flow can be tested immediately.

## CI verification
The operational implementation landed in `72542f36ccf01c079dd2deb9b9a74f0e6f985c0b`. A strict optional-property TypeScript issue in the frontend was corrected in `7fec8b4fe030354fbc53d9cb6b2cb1eb1a6c3870`.

CI run `33252665191` passed frozen dependency installation, TypeScript checks, unit tests, production build, all local D1 migrations including `0004_meal_operations.sql`, Worker startup, `/health`, and `/ready`.

## Status
CHECKPOINT COMPLETE — meal presets, administrator post-cutoff overrides, guest demand, and atomic leave-to-meal operations are implemented and CI-verified. Financial and calendar-dependent meal behavior remains deliberately deferred.
