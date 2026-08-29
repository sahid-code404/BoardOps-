# Feature parity contract

The rewrite is **not a product redesign**. The pinned reference repository defines the BoardOps product: its features, user roles, workflows, actions, screens and business outcomes must remain available unless the user explicitly approves a product change.

The target may replace unsafe or inconvenient implementation details underneath those workflows. It may also add convenience improvements such as clearer forms, search/filtering, responsive layouts, safer confirmation UI, proof previews, progress/status feedback and better error recovery. Those improvements must not remove, merge away or silently change a reference capability.

## Non-negotiable parity rules

1. **Same product capability first.** Every meaningful reference feature must exist in the rewrite.
2. **Same actor and workflow.** If the reference says a resident submits and an admin reviews, the rewrite must preserve that actor flow.
3. **Same business outcome.** A backend safety fix must not change what the feature is for.
4. **Safer internals are allowed.** D1 transactions, integer money, append-only ledger facts, R2, Queues, Workflows, secure cookies, idempotency and permission checks may replace unsafe source internals.
5. **Convenience is additive.** Better UX may make a feature easier, clearer or faster; it must not remove source actions or invent a different product workflow.
6. **Unsafe destructive financial actions become safe corrections, not missing features.** A source delete/edit/rollback control must retain the user's correction capability while the target uses void/reversal/compensating entries or immutable snapshots underneath.
7. **No new state machine unless required for safety and invisible to the user.** Do not turn an immediate source workflow into a draft/publish product flow unless the user explicitly asks for that change.
8. **No silent scope reduction.** A feature is not considered migrated until its normal path, important alternate actions, role behavior and history/review surfaces are covered.
9. **The reference repo is read-only.** Source behavior is inspected at pinned commit `77f3dec3b264c42904207f27c5f008b33c03b868`; all implementation changes go only to the target repository.
10. **A parity regression is a bug.** If the rewrite behaves differently in a user-visible way without explicit approval, correct the rewrite rather than redefining the requirement.

## Feature parity matrix

| Reference feature | Required product behavior in rewrite | Convenience improvements allowed | Safer implementation underneath | Disposition |
| --- | --- | --- | --- | --- |
| Login/session | login, logout and persistent authenticated session behavior | clearer errors, session/device list | HttpOnly cookie only, hashed session tokens, no browser bearer token | FIX |
| Registration + verification | registration, resubmission/status, email verification, forgot/reset password, change password | better progress/status UI | secure OTP storage/rate limits, no OTP logging | FIX |
| Registration review | pending residents reviewed by admins with approve/request-changes/reject/restore behavior | filters, resident 360 drawer, clearer review reasons | explicit state machine, atomic audit events | MIGRATE |
| 2FA | setup/verify/toggle/disable/backup-code workflow when enabled | clearer setup/recovery UX | protected TOTP secret, hashed backup codes, keep disabled until secure | FIX |
| Profile/avatar/sessions | profile editing, avatar, active-session/history controls | preview/crop, better device labels | R2 objects, secure session service | REPLACE INTERNALS |
| Dashboard | admin/resident dashboards and reference summaries/actions | responsive cards, clearer drill-downs | efficient D1 queries/projections | MIGRATE |
| Residents/users | user management, resident 360, room/profile lifecycle, pending/suspended/archived/restore flows | search, filters, drawers | permission checks, append-only lifecycle history | MIGRATE |
| Meals/config | meal configuration, resident meal entries and toggles | faster toggles, better calendar/status feedback | transactions and calendar guards | MIGRATE |
| Meal presets/overrides/history | presets, admin override, original-state/history semantics | clearer override dialog and history | atomic writes, immutable history | MIGRATE |
| Guest meals | guest meal add/cancel/management | compact forms, totals | transactional validation | MIGRATE |
| Leave | resident request plus admin approve/reject integrated with affected meals | date summaries and impact preview | approval + meal effects atomic, no partial application | FIX |
| Kitchen | operational kitchen view and actions | better counts/filters/mobile layout | efficient D1 queries | MIGRATE |
| Products/units | product and unit CRUD used by purchases | search/autocomplete | constraints and validation | MIGRATE |
| Purchases | preserve reference purchase creation, line items/snapshots, management and linked-expense outcome | faster line-item editor, totals, product lookup | one atomic command, integer money, closed-period guards; **do not invent a draft/publish workflow unless requested** | FIX |
| Expenses | preserve expense create/view/correct/remove/restore capability and period behavior | filters, better forms | integer money; approved history corrected by safe void/reversal/archive semantics instead of destructive financial deletion | FIX |
| Variables | system/custom variable management | typing/help text | validated typed variables | MIGRATE |
| Formula versions | formula creation/versioning/evaluation using variables | validation preview and dependency hints | fail closed on missing variables; no legacy fallback | FIX |
| Billing cycles | readiness, close, status, rollback/recovery and snapshot outcome | progress/status UI | durable idempotent Workflow; user-visible workflow remains the same | REPLACE INTERNALS |
| Monthly snapshot | preserve frozen monthly inputs/history | better inspection view | immutable snapshot is actual calculation source of truth | FIX |
| Bills | generation/refresh/status/due/history/mark-paid/correction controls | clearer bill detail, filters | snapshot-based calculation, immutable published facts and safe correction | FIX |
| Bill mark-paid | admin can perform the same offline/manual collection action | one-step dialog and receipt details | route through canonical payment/ledger posting path | FIX |
| Payments | **resident submits own payment; payment starts PENDING; admin reviews; approve/reject/void/correction/history remain available** | proof upload/preview, filters, clearer status and review UI | approval is sole posting boundary; idempotent atomic ledger posting; void uses reversal | FIX |
| Resident fund/ledger | resident/admin fund balance and full transaction history | clearer balance breakdown and filters | derived from immutable ledger entries, race-safe projection | FIX |
| Refunds | preserve refund request/management, full/partial behavior and history | amount preview, remaining-balance feedback | one canonical refund model with concurrency/idempotency guards | FIX |
| Duplicate payment-refund implementation | preserve the product refund capability, not the duplicate accounting path | none required | route all refund UX through the canonical refund engine | REPLACE INTERNALS |
| Adjustments | preserve admin correction/adjustment capability and history | guided reason/context UI | real compensating accounting command, not metadata-only | FIX |
| Restrictions | preserve automatic/manual restriction and lift behavior | clearer reason/status indicators | centralized policy/permissions | MIGRATE |
| Notifications | personal notifications, unread/read behavior and navigation | better grouping, badges, bulk read | D1 + durable outbox/Queue | REPLACE INTERNALS |
| Announcements | targeted/pinned announcements and admin management | scheduling/filtering UX | durable delivery/outbox | MIGRATE |
| Institution calendar/holidays | holidays/festivals/special/billing/refund/maintenance calendar behavior | better calendar navigation/filtering | typed rules and transactional effects | MIGRATE |
| Reports | preserve financial, meals, purchases, outstanding and resident report categories and historical selection | faster filters, clearer tables/charts | canonical ledger/snapshot sources so historical reports reproduce exactly | FIX |
| Export | preserve CSV/data export capability from report/system surfaces | background progress and download history | canonical data sources and R2 for large exports | MIGRATE |
| Audit | preserve admin audit log browsing | filters/search/details | append-only audit events, no secrets | FIX |
| Staff | preserve StaffRecord admin capability even though source lacks a dedicated first-party screen | integrate conveniently into institution administration | integer salary and permission constraints | FIX |
| Settings/policies | preserve institution settings and policy management | grouped settings, better validation | typed contracts and permission boundaries | MIGRATE |
| Theme/personalization | preserve theme/personalization choices | smoother live preview | simplified state/provider | MIGRATE |
| Tasks | preserve task visibility/status for long-running work | progress/retry/status UI | Queues/Workflows/scheduled triggers rather than request-time maintenance | REPLACE INTERNALS |
| System export/backup intent | preserve user/admin data export and operational recovery intent | guided export/restore status | Cloudflare-native backup/export; remove local-shell/SQLite implementation only | REPLACE INTERNALS |
| Repository/runtime junk | none | none | logs, local DBs, backups, agent/tool artifacts and obsolete deployment files are not product features | REMOVE |

## Payment parity correction already applied

The earlier target checkpoint let an administrator create a posted resident receipt directly from the Payments page. That changed the reference product workflow and was incorrect. The target was corrected so the resident submits a payment, it remains `PENDING`, the admin reviews supporting information/proof, and only approval posts the immutable payment + ledger credit. Rejection has no accounting effect and approved voiding appends a reversal instead of deleting history.

## Definition of done for every remaining feature

A feature cannot be marked complete merely because a new API or screen exists. Completion requires comparison against the pinned reference for:

- who can perform the action;
- entry point/navigation;
- fields and important options;
- normal workflow;
- alternate actions such as approve/reject/void/restore/rollback;
- statuses and history;
- cross-feature side effects;
- admin versus resident behavior;
- important empty/loading/error/mobile states;
- safety corrections implemented underneath without losing the product capability;
- regression coverage proving the reference workflow still works.

`REMOVE` applies only to duplicate/obsolete internals or repository/runtime junk. A meaningful BoardOps user capability must not silently disappear.