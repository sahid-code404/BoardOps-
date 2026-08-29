# 06 — Business rules

## Source rules preserved in product intent

- Residents have registration/review/lifecycle states and room/profile context.
- Meal entries are unique per resident/meal/service date, carry current and original state, cutoff/editability and history; admin overrides preserve original user state.
- Leave can target all or selected meals and is intended to apply approved absence to meal state.
- Guest meals affect guest counts/revenue.
- Purchases create item snapshots and are linked to expenses.
- Formula/variable records are versioned conceptually.
- Billing cycles have readiness, snapshot, bill-generation, settlement and closed states.
- Payments can be pending/approved/rejected; source also has void/delete/restore paths that are not safe to preserve for authoritative records.
- Refunds support partial settlement.
- Restrictions can be financial/administrative and lifted manually or automatically.
- Reports cover financial, meal, purchase, outstanding and resident views.

## Safe target interpretation

- Every state transition is explicit and permission-controlled.
- Closed periods are immutable.
- Approved payments, published bills, posted expenses/purchases, completed refunds, ledger entries and audit events cannot be edited or hard-deleted.
- Corrections create reversal/adjustment events plus corrected records.
- A frozen period's calculations and historical reports read the immutable snapshot/canonical ledger only.
- Missing/invalid canonical formulas block closing.
- Leave approval and all derived meal mutations succeed atomically or the leave remains unapproved/failed; partial application is forbidden.
- Maintenance and destructive cleanup never run as side effects of a GET request.
- User removal preserves historical financial/audit references.
- Product behavior may be improved, but economic meaning must not silently change.
