# Changelog

## 2026-08-29 — Phase 02 resident lifecycle checkpoint

- Added the first explicit registration-review model with review cycles and states.
- Added append-only resident status events and a tested lifecycle state machine.
- Added resident 360 profile/review/history API and responsive UI drawer.
- Added atomic approve/request-changes/reject/suspend/reactivate/archive/restore actions with audit history.
- Added safe resident identity editing with uniqueness validation.
- Added deterministic pending, suspended, and archived local test cases.
- CI run `33251375051` passed typecheck, tests, build, D1 migrations, Worker startup, health, and readiness probes.

## 2026-08-29 — Phase 02 first real app checkpoint

- Replaced the temporary foundation page with the real BoardOps React application shell.
- Added local-only HttpOnly-cookie sign-in with hashed D1 session tokens.
- Added D1-backed dashboard, Residents search/listing, mobile navigation, and resident-role testing.
- Added initial core-domain migration for institutions, users, sessions, and immutable audit events.
- CI run `33250647451` verified typecheck, tests, builds, D1 migration, Worker startup, health, and readiness.

## 2026-08-29 — Phase 01 source audit completed

- Completed the recursive source API and frontend feature inventory at pinned source commit `77f3dec3b264c42904207f27c5f008b33c03b868`.
- Deep-read high-risk accounting, auth/security and runtime implementations rather than inferring behavior from filenames.
- Expanded critical correction catalog: live-data billing despite snapshots, historical bill regeneration, financial hard-delete/GET purge, manual mark-paid ledger bypass, duplicate refund accounting, partial-refund race, metadata-only adjustments, unused/racy idempotency, expense/purchase period gaps, partial leave application and live historical reports.
- Recorded browser bearer-token and plaintext-TOTP-secret risks.
- Recorded filesystem upload/rate-limit/shell-backup and request-triggered-maintenance incompatibilities.
- Finalized feature parity with no unresolved `VERIFY` rows.
- Added ADRs for permission authorization, R2, email abstraction and durable workflows.
- Marked Phase 01 complete.

## 2026-08-29 — Phase 00 verified

- Phase 00 CI green in run `33249411901`; a subsequent docs/foundation run was also green.
- Frozen pnpm install uses an explicit build-script policy for reviewed native dependencies.
- TypeScript typecheck, unit tests and frontend/API builds pass.
- Local D1 migration passes in CI.
- Local Wrangler Worker starts and both `/health` and `/ready` pass.
- Foundation frontend build is 129.76 kB gzip JavaScript, under the initial 250 kB target.
- CI GitHub Actions are SHA-pinned and repository permissions are read-only.
- Phase 00 marked complete.

## 2026-08-29 — Rewrite initialized

- Created clean pnpm workspace foundation.
- Added React/Vite frontend shell preserving BoardOps glass/motion direction without implementing business features.
- Added Cloudflare Worker/Hono health and readiness foundation.
- Added local D1 schema metadata migration and R2 binding.
- Added integer-minor-unit accounting primitive and invariant test.
- Added committed lockfile and frozen-install CI.
- Began source audit while keeping the reference repository read-only.

No production deployment is authorized in these checkpoints.
