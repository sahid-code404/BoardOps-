# BoardOps

Production-grade rewrite of the BoardOps institutional accounting and operations platform.

## Current status

**Phase 00 — Foundation: IN PROGRESS**  
**Phase 01 — Source audit: IN PROGRESS**

No production deployment is authorized. No Phase 02 domain implementation should begin until Phase 00 and Phase 01 exit criteria are met.

## Architecture baseline

- React + Vite + TypeScript frontend
- Cloudflare Worker + Hono API
- Cloudflare D1 transactional SQL database
- Cloudflare R2 binary/object storage
- pnpm workspace
- Vitest + Playwright testing foundation
- Integer minor units for money

The reference repository `sahid-code404/BoardOpsv2rewrite` is treated as **read-only** and pinned for the initial audit at commit `77f3dec3b264c42904207f27c5f008b33c03b868`.

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

The first CI run bootstraps the repository's initial `pnpm-lock.yaml`; after that every install is frozen.

## Documentation

- `docs/source-audit/` — source behavior, bugs, risks, parity and migration mapping
- `docs/architecture/` — target architecture
- `docs/decisions/` — architecture decision records
- `docs/implementation-history/` — permanent phase-by-phase engineering history

Never use real production data for local development or tests.
