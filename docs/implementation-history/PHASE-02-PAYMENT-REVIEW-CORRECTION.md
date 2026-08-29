# Phase 02 — Payment review workflow correction

Status: IMPLEMENTED, CI PENDING AT COMMIT TIME

## Why this correction exists

The first target payment checkpoint preserved the new accounting invariants but changed the product workflow too much: administrators could choose a resident and post a receipt directly. That was not feature parity.

The pinned reference repository establishes the intended workflow:

1. an authenticated resident submits their own payment;
2. the payment starts as `PENDING`;
3. administrators see pending submissions;
4. an administrator approves or rejects the submission;
5. only approval creates the resident-fund accounting effect;
6. an administrator can void/correct a payment later.

That workflow is now restored at the product boundary.

## Supporting proof enhancement

The pinned reference payment form contains amount, method, optional bill, reference/UTR and notes. The audited pinned source did not contain a payment-proof upload implementation. The rewrite adds proof upload because it is a requested product requirement.

Proof behavior:

- resident must attach at least one proof;
- PDF, JPEG, PNG and WebP are accepted;
- maximum 3 files, 5 MB each;
- bytes are private in R2;
- D1 stores immutable metadata and SHA-256;
- only the submitting resident and administrators can retrieve a proof;
- failed D1 submission performs best-effort R2 cleanup.

## Corrected accounting boundary

`payment_submissions` is workflow state. The existing `payments` table from migration 0008 remains the immutable posted accounting fact.

- `PENDING`: no ledger effect.
- `APPROVED`: one immutable payment fact + one ledger credit are created atomically.
- `REJECTED`: no ledger effect; rejection is preserved.
- `VOID` from pending: no ledger effect.
- `VOID` after approval: the original credit remains and a separate immutable reversal debit is appended.

There is no delete/edit path for posted financial facts. Database idempotency and unique posting/reversal links prevent duplicate economic events.

## Deliberate differences from unsafe source behavior

The rewrite does not restore destructive financial deletion, mutable approved amounts, request-triggered cleanup, or ledger reversal gaps. Product behavior is preserved while the audited accounting defects remain corrected.

## Files

- `migrations/0009_payment_review_workflow.sql`
- `services/api/src/payment-review.ts`
- `services/api/src/entry.ts`
- `apps/web/src/features/payments/PaymentsPage.tsx`
- `apps/web/src/features/payments/payments.css`
- `apps/web/src/lib/api.ts`
- `.github/workflows/ci.yml`

## Local test expectation

Resident submits amount + method + proof -> status is PENDING and fund balance is unchanged. Admin opens Payments -> reviews proof -> APPROVE credits the ledger. REJECT does not credit. VOID on an approved submission appends a compensating debit without deleting history.
