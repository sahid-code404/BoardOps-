# 13 — Performance problems

## Existing positive work

The source lazy-loads major views with `React.lazy`, uses TanStack Query and has CSS comments/controls that deliberately limit backdrop-filter usage. These are useful patterns.

## Risks observed

- Large feature components: payments, profile, billing, meals, kitchen, expenses, calendar and others contain very large single-file implementations.
- A broad dependency set from a Next.js/shadcn-style application increases install/build/runtime surface beyond the target Worker/Vite needs.
- Financial aggregation frequently loads row sets into JavaScript and reduces there; target SQL should aggregate where appropriate.
- Some resident fund queries load arrays just to sum values, which can be pushed to SQL.
- Repeated per-resident queries in bill generation create N+1 patterns.
- Node filesystem I/O is used by rate limiting and uploads.
- Backward-compatibility paths add duplicate auth/state work.

## Target budgets

- initial JS preferably <250 KB compressed;
- lazy feature chunk preferably <150 KB compressed;
- no unexplained MB chunks;
- route-level code splitting;
- no report/export libraries on initial dashboard path;
- measured Worker/database query counts and latency;
- memory checks after repeated navigation.
