# 15 — Migration map

| Source concept | Target | Strategy |
| --- | --- | --- |
| Next.js client UI | `apps/web` React + Vite | Rewrite by feature; preserve visual/product DNA |
| Zustand `view` navigation | React Router | Replace with URL routes |
| Next API routes | Hono Worker routes | route -> use case -> domain -> repository |
| Prisma/SQLite | D1 migrations + prepared SQL | Re-model with constraints/indexes/integer money |
| `User.role` + Role tables | centralized RBAC/permissions | Consolidate; permission is canonical |
| Session cookie + bearer/localStorage | secure-cookie session | Remove browser bearer compatibility |
| Plaintext TOTP seed | protected auth secret storage | Encrypt/secure; keep feature gated until complete |
| Public filesystem uploads | R2 + D1 metadata | Replace |
| `/tmp` rate limit | Cloudflare rate limiting + D1 cooldowns | Replace |
| Nodemailer coupling | EmailService + providers | Replace internals |
| BackgroundTask/request maintenance | Queues + Workflows + scheduled triggers | Replace runtime, retain observable task state |
| Shell/local SQLite backup | Cloudflare-native backup/export operations | Remove shell implementation |
| Monthly close helper | durable Workflow + D1 use cases | Rebuild idempotent/resumable |
| MonthlySnapshot | immutable snapshot with versions/hashes | Make calculation source of truth |
| Live-table bill refresh | snapshot-only draft/publish pipeline | Replace |
| Bill/payment mark-paid variants | one payment posting command | Consolidate |
| Refund + REFUNDED-payment dual paths | canonical Refund use case | Consolidate |
| Adjustment metadata | reversal/adjustment accounting command | Fix economic behavior |
| Mutable/soft-deletable financial docs | immutable posted history | Fix |
| Ledger runningBalance | immutable entries + rebuildable projection | Fix concurrency |
| Setting-based idempotency | command idempotency table/unique constraints | Replace |
| Live reports | snapshot/ledger SQL reports | Fix historical reproducibility |
| Leave approval loop | atomic leave/meal use case | Fix |
| Large feature components | feature modules + lazy route chunks | Split by responsibility |
| Glass primitives/tokens | target design-system primitives/tokens | Extract and improve |
| Source tests | invariant/API/E2E target suites | Port intent after validating behavior |

No source implementation is copied blindly. Every feature phase begins by re-reading its pinned source behavior and the corresponding correction log.
