# Phase 01 — Source repository audit

## Objective
Understand BoardOps source behavior before migration and freeze a parity/correction map without modifying the source repository.

## Source behavior reviewed
Pinned source commit `77f3dec3b264c42904207f27c5f008b33c03b868`. Reviewed repository/root hygiene, full recursive API route tree, frontend feature/component tree, Prisma schema, navigation/design/animation system and high-risk implementations: auth/session/2FA, users/cleanup, meals/override, leave, expenses, purchases, formulas, billing cycles/readiness/snapshot/closing, bill generation/delete/mark-paid, payments, funds/ledger, refunds/partial refunds/payment-refund duplication, adjustments, reports/export, tasks/maintenance, backup, uploads, email and rate limiting.

## Existing problems discovered
The audit found critical correctness conflicts including floating-point money, non-authoritative snapshots, live-data bill regeneration, destructive financial cleanup, multiple inconsistent payment/refund paths, ledger/idempotency races, incomplete adjustment economics, period-lock gaps, partially-applied leave approvals, live historical reports, role hardcoding, bearer-token persistence, plaintext 2FA secret storage, filesystem/runtime assumptions and request-triggered maintenance.

## Architecture decisions
ADR-001 Cloudflare platform, ADR-002 D1, ADR-003 integer money, ADR-004 immutable ledger, ADR-005 snapshot billing, ADR-006 permissions, ADR-007 R2, ADR-008 email providers and ADR-009 durable workflows.

## Files added/changed
All required numbered files in `docs/source-audit/`, `FEATURE-PARITY.md`, `BUG-CORRECTIONS.md`, architecture docs, ADRs and this implementation-history entry.

## Database changes
None. Source is read-only; target domain tables remain deferred to Phase 02.

## API changes
None to product APIs. Target Phase 00 contains only foundation health/readiness/version endpoints.

## Business-rule changes
No business implementation yet. Safe/correct target rules are frozen in the audit: integer money, immutable posted history, canonical ledger, one payment/refund path, atomic/idempotent commands, snapshot-only historical calculation/reporting and fail-closed formula/period rules.

## UI/UX changes
No production feature screens implemented. Source navigation and financial workflow problems are mapped; URL routing and correction-oriented financial UX are required later.

## Animation/design changes
Source visual DNA was catalogued: glass surfaces/tokens, mesh/glow, rounded navigation/cards, Motion transitions, skeletons, counters, safe-area/responsive behavior. These are preserved conceptually.

## Performance optimizations
No source mutation. Target risks mapped: giant feature files, N+1/fan-out financial queries, JS reductions, request-triggered writes and broad framework/dependency surface.

## Memory optimizations
Target state boundaries established: TanStack Query for server state, Zustand only for tiny UI state, route/local state elsewhere; no giant duplicated responses/binaries.

## Security changes
No source mutation. Risks documented without opening committed environment values. Target decisions remove browser bearer persistence, plaintext 2FA seed, filesystem upload/rate-limit/backup assumptions and role-string authorization.

## Tests added
Phase 01 is documentation/audit. Required invariant/API/security/E2E tests are specified in accounting and bug-correction documents for implementation phases.

## Local verification
Source audit is static against the pinned commit. Phase 00 runtime verification is recorded separately.

## CI verification
Phase 01 document-only changes must pass the same target CI gate before final status is accepted.

## Known limitations
The audit is not a promise that every source implementation detail is correct. Feature phases must re-read the pinned source files immediately before coding and update the correction log if a deeper local rule is discovered. No material product area remains unclassified.

## Deferred work
All domain schema/API/product implementation starts in Phase 02 or later. Phase 02 is intentionally not started in this checkpoint.

## Exit criteria
- [x] source commit pinned/read-only
- [x] required source-audit documents exist
- [x] complete API route tree inventoried
- [x] primary frontend feature/screen tree inventoried
- [x] data/domain schema inventoried
- [x] critical financial implementations deep-read
- [x] auth/security/runtime implementations deep-read
- [x] visual/animation/performance patterns documented
- [x] feature parity matrix has no unresolved `VERIFY` status
- [x] bug-correction log records safe target behavior
- [x] migration map exists

## Final status
**COMPLETE — PHASE 02 NOT STARTED**
