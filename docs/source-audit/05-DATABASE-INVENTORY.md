# 05 — Database inventory

## Current source

- Prisma ORM
- SQLite datasource
- Single large Prisma schema
- Local database artifacts are committed in the reference repository

## Critical financial-type defect

The schema uses `Float` for authoritative money across billing-cycle totals, snapshots, bills, payments, expenses, purchases, refunds, adjustments, ledger amounts/running balances and staff salary. This is not acceptable for production accounting.

Target storage uses integer minor units, for example `₹1,250.50 -> 125050` paise.

## Deletion / referential risk

The source uses cascade deletion on many user-owned records, including financial relationships. The rewrite must prevent deletion of authoritative financial history and audit events. User offboarding must preserve accounting records with stable historical actor/entity references.

## Constraint requirements for target

- foreign keys enabled;
- unique constraints for natural/idempotent invariants;
- `CHECK` constraints for statuses/ranges where practical;
- indexes driven by query paths;
- no floating-point money;
- immutable migration history;
- explicit schema metadata;
- idempotency records and uniqueness at the database layer;
- ledger event uniqueness for source entity/action;
- period-close uniqueness and state-transition safeguards.

Phase 02 will define domain tables only after this audit exits.
