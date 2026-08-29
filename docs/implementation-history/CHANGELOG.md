# Changelog

## 2026-08-29 — Phase 00 verified

- Phase 00 CI is green in run `33249411901`.
- Frozen pnpm install now uses an explicit `allowBuilds` policy for reviewed `esbuild` and `workerd` install scripts.
- TypeScript typecheck, unit tests and frontend/API builds pass.
- Local D1 migration passes in CI.
- Local Wrangler Worker starts and both `/health` and `/ready` pass.
- Foundation frontend build is 129.76 kB gzip JavaScript, under the initial 250 kB target.
- CI GitHub Actions are pinned to immutable v7.0.0 commit SHAs and repository permissions are read-only.
- Phase 00 marked complete; Phase 01 remains in progress.

## 2026-08-29 — Rewrite initialized

- Created clean pnpm workspace foundation.
- Added React/Vite frontend shell preserving BoardOps glass/motion direction without implementing business features.
- Added Cloudflare Worker/Hono health and readiness foundation.
- Added local D1 schema metadata migration and R2 binding.
- Added integer-minor-unit accounting primitive and invariant test.
- Added committed lockfile and frozen-install CI.
- Began comprehensive source audit pinned to reference commit `77f3dec3b264c42904207f27c5f008b33c03b868`.
- Recorded critical financial, security, performance and migration findings.

No production deployment and no Phase 02 domain implementation.
