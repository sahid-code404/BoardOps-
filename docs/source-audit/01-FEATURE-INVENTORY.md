# 01 — Feature inventory

## Verified product areas

| Area | Verified source evidence | Rewrite disposition |
| --- | --- | --- |
| Authentication | login, logout, registration, registration status, email verification/OTP, forgot/reset password, change password, profile, avatar, 2FA, trusted devices, sessions/login history | MIGRATE, security model replaced |
| Residents/users | resident management, registration review cycle, status/lifecycle, resident 360 view, room/profile details | MIGRATE |
| Dashboard | summary/dashboard UI and API | MIGRATE after domain foundations |
| Meals | meal configuration, resident meal toggles, history, presets, guest meals, overrides, cutoff/editability | MIGRATE |
| Leave | leave applications with meal targeting | MIGRATE |
| Kitchen | kitchen operational view/API | MIGRATE |
| Products/units | product catalog, units and product snapshots on purchases | MIGRATE |
| Purchases | vendor purchase records with item lines and expense linkage | MIGRATE with immutable posting rules |
| Expenses | categories, receipts, period locking | MIGRATE with integer money and posting states |
| Variables | configurable operational/billing variables | MIGRATE |
| Formula engine | formula records, version history, formula evaluation | MIGRATE; become canonical with no legacy fallback |
| Billing cycles | period status, readiness, snapshots, close metadata | REPLACE internals with durable workflow |
| Monthly snapshots | frozen meals/expenses/variables/formulas JSON | MIGRATE concept; strengthen schema/hash/provenance |
| Bills | per-resident period bills, generated/paid/due state, formula metadata | MIGRATE with immutable publication semantics |
| Payments | pending/approved/rejected/void/deleted flow, effective billing cycle | MIGRATE; correct atomicity/idempotency/history |
| Resident funds | ledger-derived balance, pending deposits/refunds, outstanding due | MIGRATE; ledger model corrected |
| Refunds | full/partial refund tracking and refund transactions | MIGRATE with ledger/idempotency |
| Adjustments | correction records that reference historical entities | MIGRATE and make mandatory correction path |
| Ledger | resident credit/debit entries, running balance | REPLACE storage semantics while preserving ledger UX |
| Restrictions | financial/admin restrictions and automatic lifting | MIGRATE |
| Notifications | personal notifications | MIGRATE |
| Announcements | targeted/pinned institution announcements | MIGRATE |
| Institution calendar | holidays/festivals/special/billing/refund/maintenance dates | MIGRATE |
| Reports | reports UI/API | MIGRATE after canonical accounting queries |
| Audit | audit UI/API and AuditLog model | MIGRATE as immutable append-only events |
| Settings/policies | settings, policies, institution configuration, theme | MIGRATE with typed config boundaries |
| Background tasks | queued/running/completed/failed task records | REPLACE runtime with Queues/Workflows where appropriate |
| Staff | staff/HR schema and API | VERIFY UI parity before Phase 01 exit |
| Personalization/theme | theme/profile personalization | MIGRATE |
| System/admin | system hub/tasks/operational admin | VERIFY nested actions before Phase 01 exit |

## Source frontend navigation verified

The current root page uses a state-driven view router with lazy chunks for dashboard, meal configuration, resident meals, kitchen, billing, payments, expenses, funds, monthly closing, formula engine, users, notifications, settings, system and profile.

## Important distinction

A Prisma model or API folder alone does not prove a complete user-facing feature. Staff/system/report nested workflows remain explicitly marked for deeper endpoint-by-endpoint verification before Phase 01 is allowed to close.
