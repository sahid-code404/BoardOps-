# Phase 00 — Repository foundation

## Objective
Create the clean TypeScript/pnpm/React/Vite/Cloudflare foundation without implementing business features.

## Source behavior reviewed
Current project is Next.js + Prisma + SQLite with Node-specific filesystem/runtime behavior and a broad dependency surface.

## Architecture decisions
React/Vite web, Hono Worker API, D1, R2, pnpm workspace, integer minor-unit accounting primitive.

## Files added
Workspace configs, `apps/web`, `services/api`, first migration, development seed, accounting primitive/test, CI, architecture/security docs.

## Database changes
Only `app_schema_metadata`; domain tables intentionally deferred.

## API changes
Added `/health`, `/ready`, and `/api/v1/` foundation endpoint.

## UI/UX changes
Added a non-financial foundation screen demonstrating the intended premium glass/motion direction. No fake financial metrics.

## Performance optimizations
Vite baseline, minimal Worker, no report/chart dependencies, simple compositor-friendly ambient animation.

## Memory optimizations
No global server-data duplication; QueryClient foundation only.

## Security changes
Secrets excluded; `.env.example` contains names/defaults only. Filesystem persistence is not used by the target runtime.

## Tests added
Minor-unit integer invariant.

## Local verification
**PENDING.** The execution environment used for initialization cannot install npm dependencies directly. CI is the first executable verification path.

## CI verification
**PENDING.** Initial workflow bootstraps `pnpm-lock.yaml` once, then installs frozen and runs typecheck/test/build/local D1/Worker probes.

## Known limitations
No domain schema or product features by design.

## Deferred work
Domain model begins only after Phase 01 exits.

## Exit criteria
Lockfile committed; CI green; local D1 migration/Worker health verified; commands documented.

## Final status
**IN PROGRESS**
