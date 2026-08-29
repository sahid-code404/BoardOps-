# ADR-005 — Snapshot-only historical billing

**Status:** Accepted

Once a billing period snapshot is frozen, formula evaluation, bill generation and historical reports for that period read the snapshot, never mutable operational tables.

Missing/invalid required formulas block closing. No legacy fallback is allowed.
