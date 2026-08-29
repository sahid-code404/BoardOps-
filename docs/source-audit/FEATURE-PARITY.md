# Feature parity matrix

Allowed final audit dispositions are `MIGRATE`, `REPLACE`, `FIX`, `REMOVE`. There are no unresolved `VERIFY` rows.

| Source feature | Source implementation | New implementation intent | Preserve behavior? | Intentional correction | Test focus | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Login/session | DB sessions + cookie + bearer fallback | secure cookie session | login/logout/session UX | remove token JSON/localStorage bearer | auth/security | FIX |
| Registration review | User + RegistrationRequest + review actions | identity domain | yes | permission/state cleanup | API/E2E | MIGRATE |
| 2FA | TOTP/backup codes, feature flag off, plaintext seed | gated secure 2FA | user intent | encrypt seed, secure recovery, no half-feature | security | FIX |
| Profile/avatar/sessions | profile routes + filesystem avatar + session controls | profile + R2 + session service | yes | storage/runtime replaced | integration | REPLACE |
| Dashboard | dashboard API/view | lazy routed dashboard | yes | query efficiency | UI/API | MIGRATE |
| Meals/config | meal configuration/entries/toggles | meals domain | yes | transaction boundaries | invariant/API | MIGRATE |
| Overrides/presets/guest meals | dedicated models/routes | meals domain | yes | centralized permissions/atomic history | API | MIGRATE |
| Leave | leave app + meal mutation loop | atomic leave use case | intent | no partial approved leave | invariant/E2E | FIX |
| Kitchen | kitchen API/view | operations feature | yes | architecture/queries | E2E | MIGRATE |
| Products/units | CRUD | purchase catalog | yes | constraints | API | MIGRATE |
| Purchases | approved purchase + linked expense | draft/post purchase command | economics | immutable posting/closed-period guards | accounting | FIX |
| Expenses | approved mutable/deletable expense | draft/post expense command | economics | integer money/immutability/period guard | accounting | FIX |
| Variables | variable CRUD | typed variables | yes | validation | unit/API | MIGRATE |
| Formula versions | Formula + FormulaVersion | canonical formula engine | yes | missing references/fallback fail closed | accounting | FIX |
| Billing cycle | synchronous close helper | durable Workflow | business outcome | resumable/idempotent state machine | workflow | REPLACE |
| Monthly snapshot | JSON snapshot retained for traceability | immutable calculation input | yes | becomes source of truth | accounting | FIX |
| Bill generation | live-table generate/refresh | snapshot-based draft/publish | economic intent | immutable published bills | accounting | FIX |
| Bill mark-paid | direct APPROVED payment without canonical ledger path | payment posting use case | offline collection UX | one ledger path | accounting | FIX |
| Payments | mutable payment action routes | payment command/state machine | yes | atomic approval/reversal/idempotency | accounting/API | FIX |
| Resident fund/ledger | ledger + stored running balance | immutable entries + projection | yes | race-safe derived balance | accounting | FIX |
| Refund model | Refund + partial transactions | canonical refund use case | yes | concurrency/idempotency | accounting | FIX |
| Payment-refund path | REFUNDED Payment implementation | removed in favor of canonical refund | product refund UX | eliminate duplicate accounting model | accounting | REMOVE |
| Adjustments | metadata row | real reversal/adjustment command | correction UX | post economic effects | accounting | FIX |
| Restrictions | restriction records/lift logic | policy domain | yes | permission cleanup | API | MIGRATE |
| Notifications | DB notifications/direct side effects | D1 + Queue | yes | async delivery | integration | REPLACE |
| Announcements | targeted/pinned announcements | communications feature | yes | queue/scheduling | API/E2E | MIGRATE |
| Calendar/holidays | Holiday/event API/UI | institution calendar | yes | typed rules | API/UI | MIGRATE |
| Reports | live-table financial/meal/purchase/outstanding/resident | canonical SQL/snapshot reports | UX/categories | historical reproducibility | report invariants | FIX |
| Export | CSV/export routes and UI | lazy export module/R2 where useful | yes | canonical sources | E2E | MIGRATE |
| Audit | AuditLog | immutable audit events | yes | append-only/no secrets | security | FIX |
| Staff | StaffRecord admin API | institution staff subdomain | API capability | integer salary/permissions if used | API | FIX |
| Settings/policies | Setting/policy routes | typed config domain | yes | validation/permission boundaries | API | MIGRATE |
| Theme/personalization | theme API/store/tokens | design-system provider | yes | state simplification | UI | MIGRATE |
| System backup | hard-coded shell/local SQLite | Cloudflare-native operational backup | operational intent | remove shell implementation | operations | REPLACE |
| Tasks | DB task records + synchronous/request maintenance | Queues/Workflows/scheduled jobs | status/visibility | durable runtime | integration | REPLACE |
| Repository junk | logs/db/backups/tool/agent/obsolete deployment artifacts | none | no | intentionally excluded | repo hygiene | REMOVE |

`REMOVE` applies only when the same product intent is supplied by a canonical replacement or the item is non-product repository/runtime junk. No meaningful user capability silently disappears.
