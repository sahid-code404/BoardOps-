# BoardOps

Production-grade rewrite of the BoardOps institutional accounting and operations platform.

## Product rule: reference parity, safer implementation

This rewrite is **not a redesign of BoardOps features**. The read-only reference repository `sahid-code404/BoardOpsv2rewrite`, pinned for the audit at commit `77f3dec3b264c42904207f27c5f008b33c03b868`, defines the product capabilities and workflows.

The target must preserve the same meaningful features, actors, actions, statuses, review flows, history and business outcomes. Improvements should make those features more convenient, clearer, faster and safer—not replace them with different workflows.

Examples:

- resident-submitted payments remain resident -> pending -> admin review -> approve/reject/void; the rewrite adds safer proof storage and atomic ledger posting underneath;
- manual bill collection/mark-paid remains available to admins, but must use the canonical ledger path underneath;
- financial correction/delete-like capabilities remain available as user actions, but immutable posted history is corrected with void/reversal/compensating entries rather than destructive deletion;
- billing-cycle close/rollback keeps the same product outcome while Cloudflare Workflows can replace fragile synchronous internals;
- avatar/proof/export files keep the same product purpose while R2 replaces local filesystem storage;
- notifications/tasks keep their visible behavior while Queues/Workflows replace request-triggered background work.

No meaningful reference capability may be silently dropped or materially redesigned without explicit user approval. The detailed gate is `docs/source-audit/FEATURE-PARITY.md`.

## Current status

**Phase 00 — Repository foundation: COMPLETE**  
**Phase 01 — Source repository audit: COMPLETE**  
**Phase 02 — Domain model + real application slices: IN PROGRESS**

The temporary foundation page is gone. Current real slices include secure-cookie local sign-in, D1-backed dashboard, resident lifecycle/review, meals and meal operations, institution calendar rules, communications/notifications, and the corrected resident-submitted payment review workflow with R2 proof storage and immutable ledger posting on approval.

No production deployment is authorized. Large remaining parity areas include full authentication/verification/2FA, kitchen completion, products/units, purchases, expenses, variables/formulas, billing cycles and snapshots, bills, refunds/adjustments/restrictions, full reporting/export, audit administration, settings/policies/theme, staff, tasks and production operational flows.

## Architecture baseline

- React + Vite + TypeScript frontend
- Cloudflare Worker + Hono API
- Cloudflare D1 authoritative transactional SQL database
- Cloudflare R2 operational binary/object storage
- Cloudflare Queues for asynchronous events
- Cloudflare Workflows for durable multi-step business processes
- pnpm workspace with frozen lockfile
- Vitest + Playwright testing foundation
- Integer minor units for money
- Immutable financial history and snapshot-only historical billing as mandatory target invariants

## Local development

Requirements:

- Node.js 24.20.x LTS
- Corepack enabled

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

Frontend: `http://localhost:5173`  
Worker health: `http://localhost:8787/health`  
Worker readiness: `http://localhost:8787/ready`

### Local demo sign-in

The demo login endpoint is hard-disabled unless `APP_ENV=local`.

```text
Admin email: admin@boardops.local
Resident email: arjun@boardops.local
Password: boardops-demo
```

The browser receives an HttpOnly session cookie. D1 stores only a SHA-256 hash of the random session token.

After pulling a checkpoint with new migrations, rerun both the migration and seed commands before starting `pnpm dev`.

## Currently testable

- responsive BoardOps shell and role-aware navigation
- local sign-in/sign-out
- admin/resident dashboard foundation
- Residents search, resident 360 and registration/lifecycle review actions
- meals, presets, toggles, leave integration, guest meals and admin overrides
- institution calendar/holiday service rules and archive restoration behavior
- announcements, notifications and durable outbox behavior
- resident payment submission with supporting proof, admin review, approve/reject/void and immutable resident ledger effects
- loading/error/mobile states for implemented slices

Use the deterministic seed to reset local test data after experimenting:

```bash
pnpm db:seed:local
```

Unimplemented areas must show migration/incomplete status rather than pretend to be feature-complete.

## Documentation

- `docs/source-audit/` — source behavior, bugs, accounting conflicts, **feature-parity contract** and migration mapping
- `docs/architecture/` — target architecture
- `docs/decisions/` — architecture decision records
- `docs/implementation-history/` — permanent phase-by-phase engineering history

Never use real production data for local development or tests.
