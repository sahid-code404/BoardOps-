# 12 — Security problems

## SEC-001 — Committed environment file
A root `.env` exists in the reference tree. Values were deliberately not opened. If it ever contained real credentials, those credentials should be rotated outside this rewrite.

## SEC-002 — Browser-persisted bearer session
The source sets an HttpOnly cookie but also returns the session token from login and persists a bearer token in Zustand/localStorage for compatibility. XSS can exfiltrate localStorage. Target: opaque Secure HttpOnly cookie session only unless a separately threat-modeled token client is required.

## SEC-003 — Plaintext TOTP secret
2FA verification stores `twoFactorSecret` directly in the user record. Backup codes are hashed, but the TOTP seed itself requires reversible protection and strict access controls. Target: encrypted-at-rest TOTP secret using managed key material; backup codes one-way hashed; no generic logs.

## SEC-004 — 2FA half-feature
2FA routes exist but the feature flag is `false`. Target keeps 2FA unavailable until the secure implementation and recovery flows pass tests.

## SEC-005 — Hard-coded role authorization
`requireRole("ADMIN")` and frontend `isAdmin` checks dominate while relational Role/Permission tables also exist. Target: centralized action permissions enforced in the Worker.

## SEC-006 — Filesystem upload
Avatar upload writes to `public/uploads/avatars` through Node filesystem APIs. Target: private R2/object metadata, authorization, MIME/size checks and controlled reads.

## SEC-007 — File-backed rate limiting
The source rate limiter uses `/tmp/boardops-rate-limit.json`; this is neither distributed nor a durable security boundary. Target: Cloudflare rate limiting plus D1 cooldown/attempt state for security-critical flows.

## SEC-008 — OTP logging
Development email fallback logs OTP values. Target observability never logs OTP/password/token secrets; tests use a dedicated safe adapter/mailbox.

## SEC-009 — Shell-process backup endpoint
System backup invokes a hard-coded local shell path using child-process behavior. This is incompatible with Workers and expands command-execution risk. Target removes this runtime mechanism.

## SEC-010 — Financial idempotency absent
Duplicate requests can create duplicate money-changing records because audited financial routes do not enforce canonical idempotency. This is both correctness and abuse-resistance risk.

## Positive source behavior worth preserving

- HttpOnly cookie support with Secure in production and SameSite policy.
- Password hashing uses scrypt with random salt and timing-safe comparison.
- Opaque random session tokens are generated server-side.
- TOTP verification uses bounded time-window validation; backup codes are stored as hashes.

Positive pieces are preserved conceptually while unsafe compatibility/storage paths are removed.
