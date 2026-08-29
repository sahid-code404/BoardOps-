# BoardOps source audit

Reference repository: `sahid-code404/BoardOpsv2rewrite`  
Pinned audit commit: `77f3dec3b264c42904207f27c5f008b33c03b868`  
Reference policy: **read-only**

## Status

This directory is the Phase 01 evidence set. The first systematic pass is recorded here and includes the product surface, data model, critical accounting paths, auth/session handling, storage assumptions, UI architecture and repository hygiene.

Phase 01 is still **IN PROGRESS** until every nested API action and every material source workflow has an explicit parity disposition. Critical findings already identified are treated as blockers for direct migration.

## Highest-risk findings

1. Financial values are widely stored as Prisma `Float` instead of integer minor units.
2. Monthly bill generation still reads live expenses, variables, meals and guest-meal data even when invoked from monthly closing, defeating the intended snapshot boundary.
3. Financial side effects can escape the caller transaction; source comments explicitly accept possible rollback orphans.
4. Payment approval, ledger mutation, bill recomputation, notification and audit are separate operations rather than one atomic mutation.
5. Approved payments can be soft-deleted without a compensating ledger entry; approved unlinked payment amounts can be edited after approval.
6. Ledger running balances are computed with read-then-insert logic without serialization, and idempotency is implemented as check-then-insert without a database uniqueness invariant.
7. Authorization is predominantly role-string based (`requireRole("ADMIN")`) even though Role/Permission tables also exist.
8. A bearer session token is persisted in browser localStorage as a backward-compatibility path despite the newer HttpOnly cookie.
9. Avatar storage and rate limiting depend on local filesystem paths, incompatible with the target Worker architecture.
10. A root `.env`, local database artifacts, logs, backups, agent context and tool-result output are committed in the reference repository. Values were intentionally not inspected.

These findings define rewrite requirements; they are not instructions to patch the reference repository.
