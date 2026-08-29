# 06 — Business rules

## Rules observed in source

- Residents have lifecycle states and registration review cycles.
- Meal entries are per resident, meal and service date with unique selection; entries can be ON/OFF/LOCKED and retain an original state.
- Meal configuration controls cutoff strategy/time, visibility, default state and service windows.
- Leave can target all or specific meals.
- Guest meals contribute guest counts/revenue.
- Expenses/purchases are period inputs to billing and can be locked by a billing cycle.
- Formula/variable records are versioned conceptually.
- Payments begin pending and can be approved/rejected; source selects an effective billing cycle based on whether the current cycle is closed.
- Refunds may be partial and have child refund transactions.
- Adjustments are intended to correct history without destructive edits.
- Restrictions can be financial or administrative and can be auto/manual.
- Billing cycles move through OPEN/PREPARING/SNAPSHOT_CREATED/BILLS_GENERATED/SETTLED/CLOSED/FAILED-like states.

## Rewrite clarifications

- Business state transitions must be modeled explicitly, not inferred from ad-hoc route behavior.
- Closed periods are immutable.
- Published bills, approved payments, posted expenses/purchases, completed refunds and ledger/audit events are immutable.
- Corrections are reversals/adjustments plus new corrected entries.
- Billing calculations for a frozen period may read only the immutable period snapshot.
- Missing/invalid canonical formula blocks close; it never silently changes calculation algorithm.
