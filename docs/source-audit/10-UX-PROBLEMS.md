# 10 — UX problems and redesign opportunities

## Structural UX problems

1. Primary navigation uses a Zustand `view` key instead of URL routes, weakening deep links/history/shareability.
2. Frontend authorization is represented largely by `isAdmin` plus hard-coded admin-only destinations rather than capabilities.
3. Several feature components are very large, making loading/error/action states difficult to isolate and maintain.
4. Financial UI exposes edit/void/delete/restore patterns for records that should communicate correction/reversal history instead.
5. There are duplicate financial concepts: refunds exist both as Refund/RefundTransaction and as REFUNDED Payment rows, making the mental model ambiguous.
6. Manual bill mark-paid looks like an ordinary payment but follows a different backend accounting path.
7. Cleanup and archival semantics are hidden behind ordinary list requests; users cannot reason about when financial records become permanent.
8. Historical reports appear authoritative while reading mutable live data, so the UI cannot explain provenance/reproducibility.
9. 2FA UI/backend exists while the feature flag is off; target should not expose a half-working/security-incomplete feature.

## Rewrite direction

- URL-addressable route hierarchy and back-button-safe dialogs/sheets.
- Permission-driven navigation and action visibility.
- Clear draft -> posted/approved -> reversed/corrected lifecycle labels.
- One payment flow regardless of cash/admin/user origin.
- One refund workflow with visible transaction history.
- Human-readable immutable ledger/audit timeline on financial detail views.
- Snapshot/version provenance shown on historical bills/reports.
- Mobile-first forms, sticky actions, safe areas and no hidden destructive behavior.
- Preserve glass, motion and premium interactions while reducing cognitive complexity.
