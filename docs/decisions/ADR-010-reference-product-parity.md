# ADR-010 — Reference product parity is mandatory

Status: Accepted  
Date: 2026-08-29

## Context

BoardOps is being rewritten onto a different technical foundation. A rewrite creates a recurring risk: an implementation can be technically safer while accidentally changing who performs an action, when accounting effects occur, what review states exist, or which user controls remain available.

That happened in an early payment checkpoint where an administrator could directly post a resident receipt. The reference product instead uses resident submission followed by administrative review. The target was corrected.

## Decision

The pinned reference repository is the product-behavior baseline. The rewrite preserves meaningful user-visible capabilities and workflows unless an explicit product change is approved by the user.

For every migrated area we will first identify:

- actors/roles;
- entry points and screens;
- input fields/options;
- statuses/state transitions;
- normal flow;
- alternate actions such as approve, reject, void, restore, rollback or partial refund;
- history/audit surfaces;
- cross-feature side effects;
- accounting timing/effects;
- admin versus resident behavior.

Only after this behavioral contract is established may the implementation be changed underneath it.

## Allowed improvements

The rewrite may add convenience without changing product intent: better navigation, responsive UI, search/filtering, clearer forms, proof previews, bulk-safe actions, progress indicators, explicit reasons, accessible confirmation dialogs and stronger error recovery.

The rewrite may replace implementation internals for safety: integer minor-unit money, immutable financial facts, compensating entries, idempotency, D1 transactions, R2 object storage, secure HttpOnly sessions, centralized authorization, Queues and Workflows.

## Financial correction rule

Reference controls that edit/delete/restore/correct financial information represent user capabilities and must not simply disappear. Where destructive mutation would violate accounting safety, the target preserves the correction capability using a safe semantic such as void, reversal, compensating adjustment, archive/restore of non-posted workflow state, or immutable versioning.

The UI must make the resulting status/history understandable.

## Consequences

- `FIX` means preserve the feature/workflow while repairing unsafe logic; it does not authorize a product redesign.
- `REPLACE` means replace internals/platform mechanism while retaining the visible capability/outcome.
- A migrated feature is incomplete until its reference workflow and important alternate paths have regression coverage.
- A user-visible parity regression is treated as a bug.
- Any deliberate feature/workflow change requires explicit user approval and documentation.

The operational checklist is maintained in `docs/source-audit/FEATURE-PARITY.md`.
