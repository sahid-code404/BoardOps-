# 15 — Migration map

| Source concept | Target location | Strategy |
| --- | --- | --- |
| Next.js client UI | `apps/web` React + Vite | Rewrite by feature; preserve visual DNA, not source framework |
| Next.js API routes | `services/api/src/routes` Hono | Rewrite into route -> use case -> domain -> repository |
| Prisma schema/SQLite | D1 SQL migrations | Re-model; integer money, constraints, indexes, immutable history |
| Prisma direct access | repository layer | Replace with prepared D1 SQL |
| `User.role` + Role tables | permissions package + D1 RBAC | Consolidate to roles/permissions/action authorization |
| Local upload filesystem | R2 storage service | Replace |
| `/tmp` rate-limit file | CF rate limiting + D1 cooldowns | Replace |
| Nodemailer/Gmail coupling | `EmailService` provider abstraction | Replace internals; preserve workflows |
| BackgroundTask DB polling | Queues/Workflows | Replace runtime model; retain observable task state |
| Monthly closing helper | Cloudflare Workflow + transactional use cases | Rebuild durable/idempotent |
| MonthlySnapshot JSON | immutable snapshot tables/blob + hash/version metadata | Rebuild with reproducibility |
| Bill calculation | snapshot-only accounting package/use case | Rebuild |
| Resident fund/ledger | immutable ledger events + projections | Rebuild |
| Zustand navigation view | React Router | Replace navigation mechanism |
| Glass primitives/tokens | `apps/web/src/components/glass` + tokens | Extract and improve |
| Large feature components | feature modules + route chunks | Split by responsibility |
| Source tests | new invariant/API/E2E suites | Port intent only after validating expected behavior |

No source file is copied blindly.
