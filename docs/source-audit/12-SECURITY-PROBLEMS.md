# 12 — Security problems

## SEC-001 — Committed environment file
A root `.env` exists in the reference tree. Values were deliberately not opened. Treat any historically committed real secret as compromised and rotate it outside this rewrite if applicable.

## SEC-002 — Browser-persisted bearer token
The source auth store persists the session token in Zustand localStorage as a compatibility fallback while also using an HttpOnly cookie. XSS can exfiltrate the localStorage token. Rewrite: opaque secure cookie session only unless a separately threat-modeled token flow is required.

## SEC-003 — Hardcoded role authorization
`requireRole("ADMIN")` and frontend `isAdmin` checks are widespread. Rewrite: centralized permission evaluation enforced server-side.

## SEC-004 — Filesystem upload
Avatar upload writes directly to `public/uploads/avatars` using Node filesystem APIs. This is incompatible with ephemeral/serverless Worker execution and bypasses the target object-storage control plane. Rewrite: R2 with MIME/size/ownership/checksum metadata.

## SEC-005 — File-backed rate limiting
The source rate limiter reads/writes `/tmp/boardops-rate-limit.json`. This is not a distributed or durable security boundary and is incompatible with multi-isolate Workers. Rewrite: Cloudflare rate limiting plus application/database cooldowns for security-critical actions.

## SEC-006 — OTP logging
Development email fallback logs OTP values to console. The target observability rule prohibits logging OTPs. Test OTP delivery must use a safe test adapter/mailbox that does not leak secrets into generic logs.

## Positive source behavior

- Current session cookie is HttpOnly, Secure in production and SameSite=Lax.
- Password hashing uses scrypt with random salt and timing-safe comparison.
- Opaque random session tokens are used server-side.

These positives should be preserved while removing backward-compatibility weaknesses.
