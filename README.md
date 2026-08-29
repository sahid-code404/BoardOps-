# BoardOps

Production-grade rewrite of the BoardOps institutional accounting and operations platform.

## Current status

**Phase 00 — Repository foundation: COMPLETE**  
**Phase 01 — Source repository audit: COMPLETE**  
**Phase 02 — Domain model + first real app checkpoint: IN PROGRESS**

The temporary foundation landing page has been removed. The current local checkpoint contains a real BoardOps application shell, local secure-cookie sign-in, a D1-backed dashboard, and D1-backed Residents search/listing. Remaining product modules are visibly marked as planned rather than faked.

No production deployment is authorized. Financial posting, meals, billing, payments, refunds, reporting, and full authorization still require their dedicated migration phases.

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

If you previously ran Phase 00 locally, rerun both the migration and seed commands before starting `pnpm dev`.

## Currently testable

- responsive BoardOps app shell and navigation
- local sign-in/sign-out
- admin dashboard metrics from D1
- recent audit activity from D1
- Residents search and status filters from D1
- resident-role sign-in and resident profile dashboard
- loading/error/mobile states

Other navigation items intentionally show their migration status instead of pretending to work.

## Documentation

- `docs/source-audit/` — source behavior, bugs, accounting conflicts, parity and migration mapping
- `docs/architecture/` — target architecture
- `docs/decisions/` — architecture decision records
- `docs/implementation-history/` — permanent phase-by-phase engineering history

Never use real production data for local development or tests.
