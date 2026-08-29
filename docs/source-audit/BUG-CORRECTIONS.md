# Bug correction log

## BC-001 — Frozen snapshot was not authoritative
**Source:** closing creates a snapshot, then bill generation explicitly reads live tables.  
**Target:** calculation and closed-period reports use frozen snapshot/ledger facts only.  
**Proof:** mutate live data after freeze and reproduce identical bill/report results.

## BC-002 — Regeneration could rewrite historical economics
**Source:** existing bills can be refreshed from current data while paid history is preserved.  
**Target:** drafts may recalculate; published/closed-period bills are immutable.  
**Proof:** regeneration against a published bill is rejected/idempotent.

## BC-003 — Financial records could be permanently deleted
**Source:** bill/payment/expense cleanup can physically delete rows after soft-delete grace; some purge runs from GET.  
**Target:** authoritative financial history never hard-deletes.  
**Proof:** retention/cleanup leaves posted financial/audit rows intact and GET is side-effect free.

## BC-004 — Payment approval/void/delete could desynchronize ledger
**Target:** one atomic payment-posting/reversal command updates document, ledger, audit/outbox and related projection exactly once.  
**Proof:** failure injection and retry tests.

## BC-005 — Manual mark-paid bypassed ledger
**Source:** mark-paid creates APPROVED payment + bill recomputation but no inspected resident-ledger deposit.  
**Target:** admin cash/offline payment uses the same canonical posting command.  
**Proof:** user payment and admin mark-paid produce equivalent ledger effects.

## BC-006 — Duplicate refund accounting
**Source:** Refund/RefundTransaction exists alongside REFUNDED Payment path.  
**Target:** one Refund aggregate/use case.  
**Proof:** one refund event, one ledger effect, one idempotency result.

## BC-007 — Partial refund race
**Source:** remaining amount is read before transaction and then incrementally updated.  
**Target:** integer minor units, atomic remaining check/update, unique idempotency.  
**Proof:** concurrent refund requests cannot exceed authorized amount.

## BC-008 — Adjustment did not correct economics
**Source:** adjustment POST creates metadata only.  
**Target:** adjustment/reversal posts immutable accounting effect tied to original entry.  
**Proof:** correction changes ledger net position while original remains intact.

## BC-009 — Ledger running-balance race
**Source:** read latest balance then insert.  
**Target:** immutable entry sum authoritative; projection transaction-safe/rebuildable.  
**Proof:** concurrent deposits/settlements reconcile.

## BC-010 — Financial idempotency absent
**Source:** generic Setting-based helper is not wired to audited financial routes and follows unsafe check/work/store semantics.  
**Target:** reserve unique command key before mutation and replay stored result.  
**Proof:** repeated/concurrent requests create one result.

## BC-011 — Expense/purchase period immutability gaps
**Source:** expense POST does not enforce its computed period-lock check; purchase delete lacks closed-period guard.  
**Target:** posting state and period state both authorize mutation.  
**Proof:** closed-period create/edit/delete fails; correction route works.

## BC-012 — Leave approval could partially apply meals
**Source:** leave status updates before meal loop and meal failures are swallowed.  
**Target:** atomic application or explicit FAILED/PENDING state.  
**Proof:** injected meal failure cannot leave APPROVED partially-applied leave.

## BC-013 — Historical reports read mutable live tables
**Target:** snapshot/ledger-backed report queries with recorded formula/snapshot versions.  
**Proof:** later operational changes do not change closed-period report.

## BC-014 — Browser bearer token weakened cookie session
**Target:** HttpOnly Secure cookie session; no token in localStorage/ordinary login JSON.  
**Proof:** client storage contains no reusable session secret.

## BC-015 — Plaintext 2FA seed
**Target:** protected/encrypted TOTP secret, hashed backup codes, secure recovery and rollout gate.  
**Proof:** database dump alone does not expose usable TOTP seed.

## BC-016 — Filesystem/security runtime assumptions
**Source:** public uploads, `/tmp` rate limit and hard-coded shell backup.  
**Target:** R2, Cloudflare-native rate limiting/cooldowns, platform backup/export.  
**Proof:** multi-instance tests and no local filesystem dependency.

## BC-017 — Request-triggered background work
**Source:** list requests invoke maintenance/cleanup behavior.  
**Target:** scheduled Queue/Workflow jobs with observable status/retries.  
**Proof:** GET endpoints remain read-only and task retry is durable.
