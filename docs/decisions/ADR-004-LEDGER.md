# ADR-004 — Immutable financial ledger

**Status:** Accepted

Money-changing authoritative events append immutable ledger entries. Balance is explainable from event history. A cached/projected balance, if later introduced for performance, is non-authoritative and rebuildable.

Event uniqueness/idempotency is enforced by database constraints, not only application check-then-insert logic.
