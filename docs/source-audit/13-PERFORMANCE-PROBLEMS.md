# 13 — Performance and resource findings

## Existing positive patterns

- Major views use feature-level `React.lazy()` loading.
- TanStack Query is already used for server-state patterns.
- Glass CSS contains deliberate performance guidance limiting broad backdrop-filter usage.

## Source cost/risk findings

- Many feature files are tens of kilobytes each, including payments, profile, billing, meals, kitchen, expenses, calendar and user administration.
- Source framework/dependency surface is significantly broader than the target Worker/Vite stack.
- Historical reports and fund/credit calculations frequently fetch row arrays and reduce in JavaScript rather than using targeted SQL aggregates.
- Bill generation performs per-resident/per-entity work that creates N+1 query pressure.
- Refund eligibility iterates residents and calls credit calculation per resident.
- Resident export/fund reporting fans out account calculations.
- GET bill requests run background maintenance plus overdue update work, adding writes/latency to reads.
- GET bill/expense paths may execute purge work.
- Local filesystem I/O is used for upload/rate-limit/backup behavior.
- Duplicate auth token paths add state and attack surface.

## Target budgets/strategy

- initial JS preferably <250 KB compressed;
- individual lazy feature chunk preferably <150 KB compressed;
- route/feature splitting and selective imports;
- SQL aggregates/indexes for financial summaries;
- pagination for large datasets;
- no report/export/chart packages on initial dashboard path;
- no request-triggered cleanup loops;
- measure Worker duration, query count/latency, client memory, long tasks and animation frame consistency.

Phase 00 foundation currently meets the initial JS budget; feature phases must keep measuring as real screens are added.
