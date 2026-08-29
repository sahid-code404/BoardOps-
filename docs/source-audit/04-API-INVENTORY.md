# 04 — API inventory

## Verified top-level source API groups

`adjustments`, `announcements`, `audit-logs`, `auth`, `billing-cycles`, `bills`, `dashboard`, `expenses`, `formulas`, `funds`, `holidays`, `institution`, `kitchen`, `leave`, `meals`, `notifications`, `payments`, `policies`, `products`, `purchases`, `refunds`, `reports`, `resident-fund`, `restrictions`, `settings`, `staff`, `system`, `tasks`, `theme`, `units`, `users`, `variables`.

The source also has a root API route and numerous nested auth/user/financial actions.

## Verified auth actions

Source tree/search confirms flows for login/logout, registration, current user/profile, avatar, change password, forgot/reset password, email verification/resend, registration status and 2FA-related actions.

## Target API rule

All rewritten endpoints live under `/api/v1/...`, use shared Zod contracts, consistent domain-error envelopes, request IDs and centralized permission checks.

## Financial endpoint rule

Every money-changing command must:

1. authenticate;
2. authorize an explicit permission;
3. validate input;
4. require/resolve an idempotency key;
5. perform all D1-authoritative mutations atomically where possible;
6. write immutable ledger/audit/outbox state in the same logical operation;
7. enqueue external side effects only after the authoritative transaction is durable.

## Phase 01 remaining work

Each nested source route still needs method-by-method parity rows (GET/POST/PATCH/PUT/DELETE, input, authorization, side effects and known defects). No Phase 02 implementation is allowed until that matrix is complete.
