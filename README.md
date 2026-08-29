# BoardOps

Production-grade rewrite of the BoardOps institutional accounting and operations platform.

## Current status

**Phase 00 — Repository foundation: COMPLETE**  
**Phase 01 — Source repository audit: COMPLETE**  
**Phase 02 — Domain model + D1 database: NOT STARTED**

The requested Phase 00/01 checkpoint is **RUNNABLE — TEST NOW**. This means the clean foundation, local Cloudflare runtime and audit are verified; it does **not** mean BoardOps business features have been rewritten yet.

No production deployment is authorized. Phase 02 must begin only as a separate implementation step from the audited rules in `docs/source-audit/`.

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

The reference repository `sahid-code404/BoardOpsv2rewrite` is treated as **read-only** and the Phase 01 audit is pinned at commit `77f3dec3b264c42904207f27c5f008b33c03b868`.

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

The lockfile is committed and CI uses frozen installs. Dependency build scripts are denied unless explicitly approved in the workspace policy.

## Documentation

- `docs/source-audit/` — source behavior, bugs, accounting conflicts, parity and migration mapping
- `docs/architecture/` — target architecture
- `docs/decisions/` — architecture decision records
- `docs/implementation-history/` — permanent phase-by-phase engineering history

Never use real production data for local development or tests.
