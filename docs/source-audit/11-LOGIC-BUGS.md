# 11 — Logic bugs

| ID | Severity | Area | Finding | Rewrite action |
| --- | --- | --- | --- | --- |
| LB-001 | Critical | Billing | Monthly bill generator reads live tables even when closing owns a frozen snapshot | Snapshot-only billing repository |
| LB-002 | Critical | Payments/Ledger | Soft-delete approved payment does not compensate ledger credit | Prohibit delete; reversal transaction |
| LB-003 | Critical | Payments/Ledger | VOID of approved payment does not compensate ledger credit in inspected route | Reversal event in same transaction |
| LB-004 | High | Payments | Approved unlinked amount remains editable after ledger creation | Immutable after approval |
| LB-005 | Critical | Ledger | Read-latest-running-balance then insert is race-prone | Derived sum or serialized/transaction-safe projection |
| LB-006 | High | Ledger | Check-then-insert idempotency lacks unique DB invariant | Unique event key/idempotency table |
| LB-007 | High | Closing | Source text supports legacy formula fallback | Fail close on missing/invalid canonical formula |
| LB-008 | High | Transactions | Bill generator can emit side effects outside caller transaction | Atomic DB + outbox/workflow |
| LB-009 | Medium | Funds | Negative balance is clamped for display, potentially concealing invariant failure | Detect, alert, reconcile; never hide |
| LB-010 | High | Authorization | Role-string checks conflict with relational permission models | Permission service is canonical |

This list is a living blocker log; it is not yet the complete endpoint-by-endpoint defect catalog.
