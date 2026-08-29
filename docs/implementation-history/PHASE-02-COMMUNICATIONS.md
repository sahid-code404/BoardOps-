# Phase 02 — Communications checkpoint

## Objective
Migrate announcements and personal in-app notifications while correcting destructive/read-side-effect behavior and establishing a durable delivery boundary for later Cloudflare Queue/email/push integration.

## Implemented
- Institution-scoped announcements with Info, Warning, Maintenance and Event types.
- Normal, High and Urgent priorities.
- Everyone, Residents and Administrators audiences.
- Pinned announcements.
- Draft and immediate-publish workflows in the current UI; the schema reserves Scheduled state for a later durable scheduler.
- Resident feeds expose only published, non-expired announcements targeted to Everyone or Residents.
- Administrators can view status history, publish drafts, pin/unpin and soft-archive announcements.
- Published announcement content is immutable. Corrections require archive + a new announcement.
- Publishing atomically writes the announcement state, targeted in-app notification fan-out, an audit event and a deduplicated D1 outbox event.
- In-app notification bell with unread count, per-notification explicit read/unread state, mark-all-read and navigation to the announcement feed.
- Notification GET is side-effect free; read history is not deleted merely because a user viewed the list.
- D1 outbox observability endpoint for administrators.

## Source behavior intentionally improved
The audited source announcement route created notifications directly when publishing. The rewrite keeps targeted personal notifications but includes the publish, fan-out, audit write and durable outbox record in the same D1 batch.

The audited source notification GET called cleanup that deleted older read notifications. The rewrite does not mutate or purge data on GET. Read state changes are explicit and idempotent instead of toggle-only semantics.

## Durable outbox boundary
`outbox_events` is the transactional handoff for future Cloudflare Queue/email/push dispatch. This checkpoint does **not** claim external delivery is implemented. Pending outbox events remain visible and durable until a later dispatcher/consumer phase is implemented.

## Deliberately deferred
- automatic scheduled-announcement publishing
- Cloudflare Queue consumer/dispatcher
- external email/push providers
- announcement-to-calendar linking
- retention/archive policy beyond non-destructive history

## Local verification
```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

Admin: `admin@boardops.local`  
Resident: `arjun@boardops.local`  
Password: `boardops-demo`

The seed includes one published announcement with in-app notifications for every active local user.

## Status
IMPLEMENTED — CI must pass TypeScript, build, migrations, seed, calendar regression and the communications publish/fan-out/read/archive/outbox regression before this checkpoint is complete.
