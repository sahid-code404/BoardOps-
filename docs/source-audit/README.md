# BoardOps source audit

Reference repository: `sahid-code404/BoardOpsv2rewrite`  
Pinned audit commit: `77f3dec3b264c42904207f27c5f008b33c03b868`  
Reference policy: **read-only**

## Final Phase 01 status

**COMPLETE.** The source tree, complete API route tree, primary frontend feature tree, Prisma domain schema, navigation/design system and every material accounting/security runtime were inventoried. High-risk implementations were deep-read rather than inferred from filenames: monthly closing, bill generation, payments, bill mark-paid, refunds, adjustments, ledger/fund calculations, expenses, purchases, leave approval, auth/session/2FA, user cleanup, reports, tasks, backup, uploads, email and rate limiting.

Every material product capability now has an explicit `MIGRATE`, `REPLACE`, `FIX` or intentional `REMOVE` disposition in `FEATURE-PARITY.md`. There are no unresolved `VERIFY` rows. Individual feature phases must still re-read the pinned source implementation before coding that feature; Phase 01 is an architectural/parity audit, not permission to copy source code blindly.

## Critical blockers to direct migration

1. Authoritative money is broadly stored as floating-point values.
2. Monthly closing creates a snapshot but then explicitly calculates bills through a helper that reads live tables; the source itself says the snapshot is not the calculation source of truth.
3. Bills can be regenerated from live data and existing bills recalculated while preserving payment history, undermining historical reproducibility.
4. Approved/published financial records have destructive soft-delete paths followed by permanent deletion; purge routines can run from GET requests.
5. Payment approval, bill mark-paid and refund paths are duplicated and do not share one canonical atomic ledger mutation.
6. Admin `mark-paid` creates an APPROVED payment and recomputes the bill but does not create the resident ledger deposit used by the ordinary approval path.
7. A second `/payments/refund` implementation creates `REFUNDED` payment rows instead of using the Refund/RefundTransaction model and does not use the inspected ledger pathway.
8. Partial-refund validation reads remaining amount before the transaction, creating a concurrency/over-refund risk.
9. Adjustment creation records metadata but does not itself post a reversal/correction to the ledger or referenced financial record.
10. Generic idempotency support is check/work/store state in `Setting`; source search found no real financial route using it.
11. Ledger running balances use read-latest-then-insert logic and are race-prone.
12. Expenses can be created already APPROVED without the route actually enforcing the commented period lock; purchase deletion lacks a closed-period guard.
13. Leave approval updates the application first and then applies meal changes one by one while swallowing individual failures, so an APPROVED leave can be partially applied.
14. Historical report APIs read mutable live tables rather than closed-period snapshots/canonical ledger data.
15. Authorization remains predominantly role-string based despite separate Role/Permission tables.
16. Browser localStorage retains a bearer session token; login also returns the token in JSON even while setting an HttpOnly cookie.
17. 2FA is feature-flagged off and its verification path stores the TOTP secret in plaintext in the user row.
18. Avatar storage, rate limiting and system backup depend on local filesystem/server assumptions; the backup route invokes a hard-coded shell path.
19. Background/cleanup work is coupled to request paths instead of a durable scheduler/queue/workflow.
20. The reference repository contains `.env`, local database, backups, logs, agent/tool artifacts and obsolete deployment material that must not migrate.

These are rewrite requirements, not instructions to patch the read-only reference repository.
