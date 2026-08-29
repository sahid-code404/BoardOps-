# Phase 02 — Domain model + first real app checkpoint

## Objective
Replace the Phase 00/01 placeholder frontend with the first meaningful BoardOps application slice while introducing the first corrected D1 domain tables.

## Implemented in this checkpoint
- D1 `institutions`, `users`, `sessions`, and `audit_events` tables with foreign keys, constraints, and indexes.
- Deterministic development-only seed identities.
- Local-only sign-in endpoint using a fixed development password; non-local environments return 404 for this endpoint.
- Random session tokens; only SHA-256 token hashes are persisted in D1.
- HttpOnly, SameSite=Lax cookie session.
- Authenticated `/auth/me`, `/auth/logout`, `/dashboard`, and `/residents` APIs.
- Administrator-only Residents endpoint.
- Real React application shell with sidebar, sticky header, responsive drawer, URL routing, loading/error states and motion.
- D1-backed dashboard and Residents screens.
- Resident-role dashboard for local role testing.

## Intentionally not implemented
Meals, kitchen, financial posting, bills, payments, resident-fund ledger, refunds, monthly closing, reports, production authentication, OTP, 2FA, R2 uploads, email, Queues and Workflows. The UI identifies those modules as planned instead of presenting mock functionality.

## Accounting boundary
This checkpoint creates no financial transaction tables and therefore cannot accidentally establish a weaker financial model. Integer money, immutable ledger history, canonical payment/refund commands and snapshot-only historical billing remain mandatory for later phases.

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

## Status
IN PROGRESS until CI and local Worker probes are green for this commit.
