# Phase 02 — Reference-parity purchases and catalog

Status: VERIFIED — RUNNABLE TEST CHECKPOINT

Verified on implementation commit `5c421045c5f575f9c1719c5de0fcdf0a041e331a` by CI run `33258529228`.

## Reference behavior preserved

The pinned reference repository defines Purchases & Shopping as an administrator workflow with:

- month navigation and purchase statistics;
- vendor search;
- multi-item purchase creation;
- products and units used by the item editor;
- custom products when needed;
- quantity, unit, rate and calculated line totals;
- vendor/date/notes;
- purchase detail/history;
- automatic creation of a linked `PURCHASE` expense;
- removal with a required reason and restore capability;
- product create/update/archive behavior and unit management.

The rewrite keeps those user-visible capabilities. It does not introduce a draft/publish purchase workflow.

## Safety improvements underneath

- all money is integer minor units;
- quantities are integer thousandths (`quantity_milli`), avoiding floating-point accounting math;
- the server recomputes every line total and the purchase total;
- purchase creation and its linked expense are one D1 batch/transaction boundary;
- purchase creation has database-backed idempotency;
- purchase and linked expense facts are immutable after insertion;
- source-style `SOFT_DELETE` is represented by append-only `VOIDED` events rather than deleting or mutating the financial fact;
- restore appends a `RESTORED` event;
- catalog products are archived rather than hard-deleted, preserving historical references;
- product/unit mutations are audited;
- purchase line items snapshot product name/category/unit/rate/quantity so historical purchases do not change when the catalog changes.

## Convenience improvements

Products and units are available from a dedicated **Products & Units** tab inside Purchases instead of requiring a separate workflow. The purchase editor keeps the reference multi-item flow while providing explicit line totals, responsive layout, safer inline correction dialogs, removed-item visibility and restore controls.

## Verified regression contract

CI proves:

1. seeded products/units are available;
2. a catalog product can be created;
3. a multi-item purchase creates exactly one purchase and one linked expense;
4. integer line/total math is correct;
5. retry with the same idempotency key does not duplicate the purchase;
6. the active list and statistics include the purchase;
7. source-style deletion removes it from active totals without erasing history;
8. `includeDeleted` still exposes the removed purchase and reason;
9. restore returns the purchase to active totals;
10. product archive/restore remains available without breaking historical purchase snapshots.

Source behavior basis: pinned commit `77f3dec3b264c42904207f27c5f008b33c03b868`, especially `src/app/api/purchases/*`, `src/app/api/products/*`, `src/app/api/units/*`, and `src/components/features/billing/purchases-view.tsx`.
