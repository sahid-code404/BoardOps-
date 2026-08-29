# 07 — Accounting rules and source conflicts

## Intended accounting model

The source describes the resident ledger as the accounting backbone: money received credits the resident account; bill settlement/refunds debit it; corrections should use adjustments/reversals. The rewrite keeps that economic intent but replaces unsafe mutation mechanics.

## Blocking source defects

### ACC-001 — Floating-point money
Authoritative amounts use Prisma `Float` throughout bills, payments, expenses, purchases, refunds, adjustments, ledger and cycle totals. Target: integer minor units only.

### ACC-002 — Snapshot is not the bill-calculation source
Monthly closing creates `MonthlySnapshot`, then explicitly calls `generateBillsForPeriod`, whose comments/implementation state it reads live data and that the snapshot is retained only for traceability. Target: closed-period calculations read only frozen inputs.

### ACC-003 — Regeneration mutates historical bill economics
The bills endpoint allows repeated generation/refresh from current meal/expense/formula state while preserving payment history. Target: drafts may be recomputed before publication; published/closed-period bills are immutable and reproducible.

### ACC-004 — Financial command atomicity is inconsistent
Payment approval, bill recomputation, restrictions, notifications and audit are separate operations in key routes. Target: one authoritative transaction plus outbox/queue.

### ACC-005 — Manual mark-paid bypasses the canonical ledger path
`/bills/:id/mark-paid` creates an already-APPROVED payment and recomputes the bill, but the inspected route does not create the resident ledger deposit used by normal payment approval. Target: all receipt methods invoke one payment-posting command.

### ACC-006 — Duplicate refund models/paths
The source has Refund/RefundTransaction and a separate `/payments/refund` path that records a `Payment` with `REFUNDED` status. Target: one refund domain/use case with one ledger effect.

### ACC-007 — Partial-refund concurrency risk
Refund remaining amount is checked from a row read before the transaction; concurrent requests may act on the same remaining value. Target: integer money + atomic conditional mutation/idempotency.

### ACC-008 — Adjustments are not accounting corrections
Creating an Adjustment records metadata but does not itself reverse/post the referenced payment/refund/bill/expense. Target: adjustment command must create explicit economic ledger effects and references.

### ACC-009 — Approved records can enter deletion queues
Bills/payments/expenses/purchases have soft-delete patterns and cleanup code later physically deletes financial rows. Target: authoritative history is never hard-deleted.

### ACC-010 — GET requests can permanently purge financial data
Bill/expense GET paths call cleanup functions that can permanently delete records after the grace period. Target: GET is side-effect free; archival policies cannot delete authoritative history.

### ACC-011 — Ledger running-balance race
Ledger creation reads the latest running balance before inserting the next row. Concurrent commands can share the same prior balance. Target: immutable amounts are authoritative; any projection is transaction-safe/rebuildable.

### ACC-012 — Idempotency is not actually enforced on financial routes
A helper stores `idem:` keys in Settings after work, but source search found no material financial route calling it; check/work/store would also race without reservation/unique constraints. Target: database-enforced command idempotency.

### ACC-013 — Expense period lock is not enforced on create
Expense POST computes a current/future-month boolean but does not use it and creates the expense as APPROVED. Target: period state gates posting.

### ACC-014 — Purchase deletion bypasses period immutability
Source purchase deletion can soft-delete the purchase and linked expense without a closed-period guard. Target: posted purchase corrections are reversals, never deletion.

### ACC-015 — Report sources are non-reproducible
Historical financial/meal reports query live tables. Target: closed-period reports use snapshot/ledger facts.

### ACC-016 — Negative-balance masking
Fund/credit helpers clamp negative derived values to zero in places. Target: invalid negative state is surfaced/reconciled, not hidden.

## Mandatory target invariant tests

- integer money only;
- approved/published records immutable;
- no hard delete of authoritative financial/audit history;
- one economic event -> one canonical set of ledger entries;
- command retries do not duplicate money;
- closed snapshot reproduces bills after live data changes;
- ledger sums reconcile to projections;
- reversal preserves history and restores expected economic position;
- concurrent partial refunds cannot over-refund;
- failed commands leave no partial authoritative mutation;
- GET requests do not mutate/purge financial state.
