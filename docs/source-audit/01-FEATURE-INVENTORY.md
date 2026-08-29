# 01 — Feature inventory

## Verified product capability map

| Area | Source behavior/surface | Rewrite disposition |
| --- | --- | --- |
| Authentication | login/logout, registration/resubmission/status, email OTP verification, password reset/change, profile/avatar, sessions/login history | FIX |
| 2FA | TOTP setup/verify/toggle/disable/backup codes; currently feature-flagged off | FIX; keep disabled until secure target implementation |
| Residents/users | user management, registration review/reject/request-changes/restore, resident 360, room/profile lifecycle | MIGRATE |
| Dashboard | resident/admin summary data and dashboard UI | MIGRATE |
| Meals | configuration, entries/toggle, presets, override/history/original-state semantics, guest meals | MIGRATE with transaction cleanup |
| Leave | resident leave request and admin approval/rejection integrated with meals | FIX atomic application |
| Kitchen | operational meal/kitchen view and API | MIGRATE |
| Products/units | product catalog and units | MIGRATE |
| Purchases | purchase + item snapshots + linked expense, immediately approved in source | FIX posting/immutability |
| Expenses | expense creation/edit/delete/restore, period locking concept | FIX posting/closed-period rules |
| Variables | active/system/custom variables | MIGRATE |
| Formula engine | formula expressions, versions, referenced variables, evaluation | FIX; canonical only, no fallback |
| Billing cycles | readiness, close, rollback, snapshot, status transitions | REPLACE internals with durable workflow |
| Monthly snapshots | frozen meals/expenses/variables/formulas | FIX so snapshot becomes actual calculation source |
| Bills | generation/refresh, status/due, manual mark-paid, delete/restore | FIX immutable publication and canonical payment path |
| Payments | submit, approve/reject/void/edit/delete/restore, effective-cycle logic | FIX atomicity/idempotency/reversal |
| Resident funds | ledger-derived account/balance, pending deposits/refunds/outstanding | FIX canonical ledger/projection |
| Refunds | Refund + RefundTransaction partial-payment model | FIX concurrency/idempotency |
| Payment-refund path | separate refund implementation using `Payment(status=REFUNDED)` | REPLACE with canonical refund use case |
| Adjustments | adjustment metadata referencing historical entities | FIX into real accounting correction command |
| Restrictions | financial/admin restrictions and manual/automatic lifting | MIGRATE |
| Notifications | personal notifications | REPLACE delivery runtime with D1 + queue |
| Announcements | targeted/pinned announcements | MIGRATE |
| Institution calendar | holidays/festivals/special/billing/refund/maintenance events | MIGRATE |
| Reports | financial/meals/purchases/outstanding/residents + CSV export | FIX data sources; preserve report UX |
| Audit | audit log UI/API | FIX append-only model |
| Settings/policies | institution settings, policies, theme/personalization | MIGRATE with typed contracts |
| Staff | StaffRecord admin API; no dedicated first-party feature view was present in the audited feature tree | MIGRATE as institution administration, not silently drop |
| Tasks | task records for closing/report export/session cleanup/bill generation/announcements | REPLACE with Queue/Workflow runtime plus observable state |
| System backup/export | user-facing data export concept plus hard-coded server backup API | MIGRATE export; REMOVE obsolete shell backup implementation and REPLACE operational backup strategy |

## Verified primary frontend views

The source feature tree contains dashboard, authentication/profile, meals, kitchen, billing, payments, expenses, purchases/products, funds, monthly closing, formula/variables, users/resident-360, notifications/announcements, calendar, reports, audit, settings/policies/holidays, system/data export, tasks, theme/personalization and supporting dialogs/sheets.

The source root uses a Zustand `view` router with feature-level lazy imports. The rewrite retains lazy feature chunks but replaces navigation state with URL-addressable React Router routes.

No capability in the audited source tree is silently discarded; intentional implementation removals are limited to obsolete runtime/deployment mechanisms, not product intent.
