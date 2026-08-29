# BoardOps

Production-grade rewrite of the BoardOps institutional accounting and operations platform.

## Current status

**Phase 00 — Repository foundation: COMPLETE**  
**Phase 01 — Source repository audit: COMPLETE**  
**Phase 02 — Domain model + real application slices: IN PROGRESS**

The temporary foundation landing page is gone. The current local checkpoint is a real BoardOps application with secure-cookie local sign-in, a D1-backed dashboard, Residents search/listing, resident 360 details, registration review, editable resident identity fields, and audited lifecycle actions.

No production deployment is authorized. Meals, financial posting, billing, payments, refunds, reporting, production authentication, and full permission-based authorization still require their dedicated migration phases.

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

The reference repository `sahid-code404/BoardOpsv2rewrite` is read-only and the Phase 01 audit is pinned at commit `77f3dec3b264c42904207f27c5f008b33c03b868`.

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

- responsive BoardOps app shell and navigation
- local sign-in/sign-out
- admin dashboard metrics and recent audit activity from D1
- Residents search and Active/Pending/Suspended/Archived filters
- resident 360 side drawer
- pending registration approve / request changes / reject workflow
- resident profile editing for safe identity fields
- suspend / reactivate / archive / restore lifecycle actions
- append-only resident lifecycle history and audit updates
- resident-role sign-in and resident profile dashboard
- loading/error/mobile states

Use the deterministic seed to reset lifecycle test data after experimenting:

```bash
pnpm db:seed:local
```

Other navigation items intentionally show their migration status instead of pretending to work.

## Documentation

- `docs/source-audit/` — source behavior, bugs, accounting conflicts, parity and migration mapping
- `docs/architecture/` — target architecture
- `docs/decisions/` — architecture decision records
- `docs/implementation-history/` — permanent phase-by-phase engineering history

Never use real production data for local development or tests.
