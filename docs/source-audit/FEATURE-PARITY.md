# Feature parity matrix

Status values: `MIGRATE`, `REPLACE`, `FIX`, `REMOVE`, `VERIFY`.

| Source feature | Source implementation | New implementation | Behavior preserved? | Intentional change? | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Login/session | Next API + DB session + cookie + bearer fallback | secure-cookie Worker session | Core login yes | remove localStorage bearer fallback | planned Phase 03 | REPLACE |
| Registration review | User + RegistrationRequest | D1 identity domain | yes | permission model | planned | MIGRATE |
| 2FA | auth routes/user fields | Worker auth service | intended | implementation may change for CF runtime | planned | VERIFY |
| Dashboard | dashboard view/API | route-lazy React feature | intended | information hierarchy may improve | planned | MIGRATE |
| Meal configuration | meal models/routes/views | meals domain | yes | architecture only | planned | MIGRATE |
| Resident meal selection | MealEntry/history | meals domain | yes | clarify state/history | planned | MIGRATE |
| Overrides/presets/guest meals | dedicated models/routes | meals domain | yes | enforce permissions | planned | MIGRATE |
| Leave-meal integration | LeaveApplication | resident operations | intended | verify edge cases | planned | VERIFY |
| Kitchen | kitchen view/API | operations feature | intended | UX redesign allowed | planned | MIGRATE |
| Products/units | Product/Unit | purchases domain | yes | stricter constraints | planned | MIGRATE |
| Purchases | Purchase/Item + expense link | purchase/posting use cases | yes | immutable posting | planned | FIX |
| Expenses | Expense | expense/posting use cases | yes | integer money + immutable posting | planned | FIX |
| Variables | Variable | typed variables | yes | typed validation | planned | MIGRATE |
| Formula versions | Formula/Version | canonical formula engine | core intent | no fallback | invariant tests | FIX |
| Monthly snapshot | MonthlySnapshot | immutable snapshot | yes | hash/provenance/queryable indexes | invariant tests | FIX |
| Bill generation | live table generator | snapshot-only generator | economic intent | algorithm boundary corrected | invariant tests | FIX |
| Payments | mutable payment route | command/state machine | yes | immutable approval + reversals | invariant tests | FIX |
| Ledger | LedgerEntry + running balance | immutable events/projection | yes | concurrency/idempotency fixed | invariant tests | FIX |
| Refunds | Refund + transactions | refund use cases | yes | atomic ledger integration | invariant tests | FIX |
| Adjustments | Adjustment | correction use case | yes | mandatory correction pathway | invariant tests | MIGRATE |
| Restrictions | Restriction engine | domain policy | intended | permission/policy cleanup | planned | MIGRATE |
| Notifications | DB notifications | D1 + Queue delivery | yes | async delivery | planned | REPLACE |
| Announcements | Announcement | communications feature | yes | runtime split | planned | MIGRATE |
| Calendar/holidays | Holiday | institution calendar | yes | route/data cleanup | planned | MIGRATE |
| Reports | report views/APIs | lazy report feature | intended | canonical SQL sources | planned | VERIFY |
| Audit log | mutable relational model/API | immutable audit events | yes | stronger append-only rule | security tests | FIX |
| Staff | schema/API | TBD after UI parity check | unknown | unknown | planned | VERIFY |
| Theme/personalization | source tokens/store | design-system provider | yes | improve route/state model | UI tests | MIGRATE |
| Files/avatar | public filesystem | R2 | user behavior yes | storage replaced | integration tests | REPLACE |
| Background tasks | DB task model | Queues/Workflows | observable behavior yes | runtime replaced | integration tests | REPLACE |

Phase 01 cannot exit while any material row remains `VERIFY` without an explicit decision.
