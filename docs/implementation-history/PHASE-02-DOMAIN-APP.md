# Phase 02 — Domain model + real application checkpoints

## Objective
Replace the Phase 00/01 placeholder frontend with meaningful BoardOps application slices while introducing corrected D1 domain boundaries before financial implementation.

## Checkpoint 1 — app shell + first core domain
Implemented:
- D1 `institutions`, `users`, `sessions`, and `audit_events` tables with foreign keys, constraints, and indexes.
- Deterministic development-only seed identities.
- Local-only sign-in endpoint using a fixed development password; non-local environments return 404 for this endpoint.
- Random session tokens; only SHA-256 token hashes are persisted in D1.
- HttpOnly, SameSite=Lax cookie session.
- Authenticated `/auth/me`, `/auth/logout`, `/dashboard`, and `/residents` APIs.
- Real React application shell with sidebar, sticky header, responsive drawer, URL routing, loading/error states and motion.
- D1-backed dashboard and Residents search/listing.
- Resident-role dashboard for local role testing.

CI run `33250647451` passed frozen install, TypeScript checks, unit tests, builds, local D1 migrations, local Worker startup, and `/health` + `/ready` probes.

## Checkpoint 2 — resident identity lifecycle + registration review
Implemented:
- D1 `registration_requests` with explicit review cycles and review states.
- Append-only D1 `resident_status_events` for resident lifecycle history.
- Pure resident lifecycle state machine with tested valid/invalid transitions.
- Admin resident 360 API returning profile, latest registration review, lifecycle history, and currently allowed actions.
- Atomic D1 batch for resident lifecycle changes: canonical user state, lifecycle event, audit event, and registration-review state update are committed together.
- Pending registration actions: approve, request changes with selected fields, and reject.
- Active/suspended/archived lifecycle actions: suspend, reactivate, archive, and restore.
- Sessions are invalidated when a resident is suspended, archived, or rejected.
- Safe resident identity editing for name, email, phone, room, and gender, with email uniqueness validation and audit entry.
- Residents UI now includes Archived filtering, clickable rows, responsive resident 360 drawer, profile editing, registration review details, confirmation dialogs, and lifecycle timeline.
- Deterministic local seed cases for pending review, suspended resident, and archived resident.

CI run `33251375051` passed frozen install, TypeScript checks, resident lifecycle unit tests, builds, all local D1 migrations, local Worker startup, and `/health` + `/ready` probes.

## Accounting boundary
Phase 02 still creates no financial transaction tables. It therefore does not establish an interim or weaker financial model. Integer money, immutable posted history, canonical ledger/payment/refund commands, atomic/idempotent financial posting, and snapshot-only historical billing remain mandatory for later phases.

## Intentionally not implemented yet
Meals, kitchen, expenses/purchases, financial posting, bills, payments, resident-fund ledger, refunds, monthly closing, reports, production authentication, OTP, 2FA, full permission RBAC, R2 uploads, email, Queues, and Workflows.

## Local verification commands
```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

Admin: `admin@boardops.local`  
Resident: `arjun@boardops.local`  
Password: `boardops-demo`

To reset resident lifecycle demo state after testing:

```bash
pnpm db:seed:local
```

## Status
CHECKPOINT 2 COMPLETE — Phase 02 continues. The next domain/application slice can now build on an explicit resident identity and lifecycle model.
