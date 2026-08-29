# Bug correction log

## BC-001 — Billing ignored the snapshot boundary
**Source behavior:** shared bill generation reads live operational tables.  
**Why incorrect:** historical bills can vary after the period was frozen.  
**New behavior:** all closed-period calculation inputs come from the immutable snapshot only.  
**Affected records:** snapshots, bills, ledger settlements.  
**Migration impact:** source historical data will need a reconciliation/import policy; do not silently recalculate.  
**Tests:** mutate live data after snapshot and prove reproduced bill is byte/economically identical.

## BC-002 — Approved payment destructive states can leave stale ledger credit
**Source behavior:** soft-delete/void paths recompute bill state without a guaranteed compensating ledger event.  
**Why incorrect:** ledger-derived balance can disagree with document state.  
**New behavior:** approved payments are immutable; correction creates reversal/adjustment and a new entry if required.  
**Tests:** approve -> reverse and prove history preserved and net ledger position correct.

## BC-003 — Approved unlinked payment amount can be edited
**Source behavior:** amount edit is blocked only for approved payments linked to bills.  
**New behavior:** any approved payment is immutable.  
**Tests:** mutation rejected; reversal flow succeeds.

## BC-004 — Ledger running-balance race
**Source behavior:** read latest balance then write new balance.  
**New behavior:** immutable amounts are authoritative; projection update is transaction-safe/rebuildable.  
**Tests:** concurrent deposits cannot lose/misstate balance.

## BC-005 — Formula fallback ambiguity
**Source behavior:** readiness messaging supports a legacy fallback when formula is missing/invalid.  
**New behavior:** close is blocked with `FORMULA_INVALID`/missing-formula domain error.  
**Tests:** invalid/missing formula cannot create snapshot/bills.

## BC-006 — File-backed security/runtime state
**Source behavior:** rate limits and avatar storage depend on local filesystem.  
**New behavior:** Cloudflare-native rate limiting/cooldowns and R2 storage.  
**Tests:** multi-request rate-limit tests and R2 authorization/metadata tests.
