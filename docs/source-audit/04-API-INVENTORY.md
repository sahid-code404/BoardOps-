# 04 — API inventory

The complete recursive source API tree at the pinned audit commit was inventoried. Top-level groups are:

`adjustments`, `announcements`, `audit-logs`, `auth`, `billing-cycles`, `bills`, `dashboard`, `expenses`, `formulas`, `funds`, `holidays`, `institution`, `kitchen`, `leave`, `meals`, `notifications`, `payments`, `policies`, `products`, `purchases`, `refunds`, `reports`, `resident-fund`, `restrictions`, `settings`, `staff`, `system`, `tasks`, `theme`, `units`, `users`, `variables`.

## Important nested actions verified from the tree/implementation

- Auth: 2FA setup/verify/toggle/disable/backup-codes, avatar, change-password, forgot/reset password, login/logout/me/profile, register/resubmit/status, send/resend/verify OTP/email, sessions and session revocation.
- Billing: billing-cycle readiness/close/rollback, bills generate/list/delete/detail/restore/mark-paid.
- Meals: config, entries, toggle, override, presets; leave has request and admin decision routes.
- Payments: base payment operations, per-payment mutation/restore, separate payment-refund endpoint.
- Refunds: refund list/create/detail and partial-refund transaction.
- Purchases/expenses/products/units: CRUD plus purchase stats and restore/deletion paths.
- Reports: financial, meals, purchases, outstanding, residents and export.
- Funds: resident fund summary, personal summary and ledger history.
- Users: list/detail, resident-360, reject, request-changes and restore.
- Restrictions: create/list, lift and user-specific views.
- Tasks: task list/create/detail and cleanup.
- System: backup action.

## Cross-cutting defects found by implementation reads

- financial routes do not share one command/idempotency/ledger boundary;
- destructive purge/maintenance can be triggered by GET endpoints;
- source generic idempotency helper is not wired into the audited financial routes;
- authorization is largely role-string based;
- side effects such as notification/audit are frequently separate writes;
- report endpoints read mutable live tables for historical periods;
- server filesystem and shell-process APIs appear in endpoints that must become Worker-native.

## Target contract

All rewritten endpoints use `/api/v1/...`, shared Zod contracts, request IDs, consistent domain-error envelopes, server-side permission checks and command-level idempotency. A financial command must validate/authenticate/authorize, reserve the idempotency key, execute all D1-authoritative state + ledger + audit/outbox writes atomically where possible, and only then dispatch external side effects.

Phase 01 API inventory is complete; route behavior is not to be copied mechanically.
