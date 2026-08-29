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

## Animation/design changes
Added a minimal compositor-friendly ambient mesh/glass foundation and reduced-motion handling without implementing product screens.

## Performance optimizations
Vite baseline, minimal Worker, no report/chart dependencies, simple compositor-friendly ambient animation. Current production frontend foundation build is 129.76 kB gzip JavaScript, below the initial 250 kB budget.

## Memory optimizations
No global server-data duplication; QueryClient foundation only.

## Security changes
Secrets excluded; `.env.example` contains names/defaults only. Filesystem persistence is not used by the target runtime. CI dependency build scripts use an explicit `allowBuilds` map. GitHub Actions are SHA-pinned and CI has read-only repository contents permission.

## Tests added
Minor-unit integer invariant: integer paise is accepted and fractional authoritative money is rejected.

## Local verification
**PASSED in the isolated CI local runtime.** Wrangler applied `0000_foundation.sql` to local D1, started the local Worker, and `/health` plus `/ready` both succeeded. User-machine smoke testing remains a separate manual checkpoint.

## CI verification
**PASSED.** GitHub Actions run `33249411901` passed frozen dependency install, strict typecheck, unit tests, frontend/API build, local D1 migration, Worker startup, health probe and readiness probe.

## Known limitations
No domain schema or product features by design. Phase 01 remains incomplete.

## Deferred work
Domain model begins only after Phase 01 exits.

## Exit criteria
- [x] lockfile committed
- [x] frozen install passes
- [x] typecheck passes
- [x] tests pass
- [x] frontend/API build passes
- [x] local D1 migration passes
- [x] local Worker starts
- [x] health/readiness probes pass
- [x] commands documented

## Final status
**COMPLETE — FOUNDATION RUNNABLE**
