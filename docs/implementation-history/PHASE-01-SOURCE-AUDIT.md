# Phase 01 — Source audit

## Objective
Understand source product behavior before migration and document parity, defects and migration strategy.

## Source behavior reviewed
Repository tree/hygiene, dependency/runtime architecture, Prisma schema, API top-level inventory, primary frontend view router, glass design system, payment mutation route, resident fund/ledger, monthly closing, bill generation, session/auth store, email, avatar storage and rate limiting.

## Existing problems discovered
See `docs/source-audit/11-LOGIC-BUGS.md`, `12-SECURITY-PROBLEMS.md` and `13-PERFORMANCE-PROBLEMS.md`. Critical accounting defects include live-data billing after snapshot, transaction escapes, payment/ledger inconsistencies, floating-point money and ledger concurrency/idempotency risks.

## Architecture decisions
Captured in ADR-001 through ADR-005.

## Files added
All required numbered source-audit documents plus feature parity and bug-correction logs.

## Database changes
None in this phase.

## API changes
None; source remains read-only.

## Business-rule changes
None implemented yet; correction requirements are documented for later phases.

## UI/UX changes
None to product features; navigation/design observations are documented.

## Animation/design changes
None; reusable visual patterns are catalogued.

## Performance optimizations
None to source; target opportunities documented.

## Memory optimizations
None to source; target state boundaries documented.

## Security changes
No source mutations. Committed secret-file risk recorded without opening values.

## Tests added
No source tests changed. Required future invariants are documented.

## Local verification
Not applicable to read-only source audit; source code was inspected at pinned commit.

## CI verification
Not applicable to source repository; target CI remains Phase 00 gate.

## Known limitations
Nested endpoint-by-endpoint and dialog/subview parity remains to be completed for all material feature paths, especially staff/system/reports and secondary auth/admin actions.

## Deferred work
No code migration may depend on unverified behavior.

## Exit criteria
Every material source capability has a parity disposition; no unexplained `VERIFY` row remains; all critical financial/security conflicts have a documented safe target rule.

## Final status
**IN PROGRESS**
