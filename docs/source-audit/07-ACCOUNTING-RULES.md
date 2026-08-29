# 07 — Accounting rules and defects

## Intended source accounting model

The source describes the resident ledger as the accounting backbone: deposits credit a resident balance, bill settlement debits it, refunds debit it and adjustments may credit/debit it. Bills track paid/due amounts separately.

## Blocking defects discovered

### ACC-001 — Floating-point money
Authoritative money is stored as `Float`. Rewrite: integer minor units only.

### ACC-002 — Snapshot boundary is violated
`generateBillsForPeriod()` loads variables, expenses, meal entries and guest meals from live tables. Monthly closing imports/calls this same generator. A snapshot may exist while billing still depends on mutable operational state. Rewrite: calculations consume snapshot repositories only.

### ACC-003 — Transaction escape / rollback orphans
The bill generator explicitly documents that ledger/notification helpers may use the singleton DB outside a caller transaction and considers rollback orphans harmless. Financial side effects are not harmless. Rewrite: no authoritative ledger event can survive a rolled-back source transaction unless an explicit saga/outbox compensates it.

### ACC-004 — Payment approval is not one atomic command
Source updates payment status, then creates ledger entry, recomputes bill, changes restriction state, sends notification and writes audit separately. A failure between steps can leave inconsistent state.

### ACC-005 — Approved payment deletion can desynchronize ledger
Source DELETE marks a payment DELETED and recomputes the bill, but does not write a compensating ledger event. The ledger-derived balance can remain credited.

### ACC-006 — Approved unlinked payment amount can be edited
Source blocks amount edits only when an approved payment is linked to a bill. An approved unlinked payment can therefore change amount after its deposit ledger entry was created.

### ACC-007 — Payment VOID lacks ledger reversal
VOID recomputes linked bill state but the inspected path does not create a reversing ledger entry for the already-approved deposit.

### ACC-008 — Running-balance race
Ledger creation reads the latest running balance and inserts a new entry. Concurrent commands can read the same prior balance and produce incorrect running balances.

### ACC-009 — Ledger idempotency is race-prone
Bill-settlement idempotency is check-then-insert and the inspected schema has no unique constraint guaranteeing one settlement entry per bill.

### ACC-010 — Negative-balance masking
The fund view returns `Math.max(0, availableBalance)`. Display clamping can hide an accounting invariant violation instead of surfacing/reconciling it.

### ACC-011 — Formula fallback conflict
Monthly-closing readiness text advertises a legacy fallback if `formula.mealCharges` is missing/invalid. The rewrite has one canonical formula path and fails closed.

## Required invariant tests in target

- approved/published records cannot be mutated/deleted;
- each idempotency key yields one financial result;
- each source financial event creates the expected ledger events once;
- closed snapshot reproduces bills regardless of later live-data changes;
- ledger sum equals derived balance;
- reversal restores the expected economic position without deleting history;
- failed transactions leave no partial authoritative mutations.
