# 11 — Logic bug catalog

| ID | Severity | Area | Finding | Target correction |
| --- | --- | --- | --- | --- |
| LB-001 | Critical | Billing | Snapshot exists but closing deliberately calculates bills from live-table helper | Snapshot-only billing |
| LB-002 | Critical | Billing | Re-running bill generation recalculates existing bills from current data while retaining payment history | Immutable publication/versioned drafts |
| LB-003 | Critical | Bills | Bill delete/delete-all can schedule authoritative bills for permanent deletion | No hard/soft destructive delete after authority |
| LB-004 | Critical | Cleanup | GET bill/expense paths can trigger permanent financial-row purge | Side-effect-free GET; no authoritative purge |
| LB-005 | Critical | Payments | Payment approval is multi-write/non-atomic across ledger/bill/restriction/notification/audit | Atomic command + outbox |
| LB-006 | Critical | Payments | Approved payment void/delete can desynchronize ledger without guaranteed reversal | Reversal ledger event |
| LB-007 | High | Payments | Approved unlinked payment amount can be edited | Immutable after approval |
| LB-008 | Critical | Bills/Payments | Admin mark-paid creates APPROVED payment but no inspected resident ledger deposit | Canonical payment-posting use case |
| LB-009 | Critical | Refunds | `/payments/refund` duplicates Refund model and bypasses canonical refund/ledger pathway | One refund domain |
| LB-010 | Critical | Refunds | Partial refund validates stale remaining amount outside transaction | Atomic conditional update + idempotency |
| LB-011 | High | Adjustments | Adjustment creation is metadata-only and does not post correction economics | Adjustment/reversal ledger command |
| LB-012 | Critical | Ledger | Read-latest-running-balance then insert races | Derived/rebuildable safe projection |
| LB-013 | Critical | Idempotency | Generic helper is unused by audited financial routes; check/work/store is not a safe reservation | DB unique idempotency state |
| LB-014 | High | Expenses | Create route calculates period boolean but never enforces lock and posts APPROVED immediately | Explicit draft/post + closed-period guard |
| LB-015 | High | Purchases | Purchase+linked expense can be soft-deleted without closed-period guard | Posted correction/reversal |
| LB-016 | High | Leave/Meals | Leave is marked approved before per-day meal writes; individual failures are swallowed | Atomic leave application |
| LB-017 | High | Reports | Historical financial/meal reports read live tables | Snapshot/ledger-backed reports |
| LB-018 | High | Reports | Outstanding report mixes carried previous-due state with current due in row totals; canonical ledger reconciliation is safer | Canonical balance/report query |
| LB-019 | High | Auth | Role-string model conflicts with Role/Permission tables | Central permission service |
| LB-020 | High | Auth | Login returns bearer token in JSON and browser store persists it | Cookie-only opaque session |
| LB-021 | High | 2FA | TOTP secret is stored plaintext; feature is currently disabled | Encrypted secret, hashed backup codes, gated rollout |
| LB-022 | High | Tasks | Maintenance/cleanup work is coupled to request paths rather than durable scheduler | Queue/Workflow/cron |
| LB-023 | Medium | Funds | Negative balance/credit can be clamped to zero | Surface invariant failure |
| LB-024 | High | Runtime | System backup executes hard-coded shell script/local SQLite assumptions | Cloudflare-native operational backup/export |

The list records source behavior at the pinned audit commit; it is the defect baseline for later invariant tests.
