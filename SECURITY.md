# Security policy

BoardOps handles authentication, resident data and financial records. Security defects should be treated as high priority.

## Non-negotiable rules

- Never commit credentials, OTP values, session tokens, SMTP passwords, Cloudflare tokens, signing keys, OAuth secrets or production database files.
- Keep secrets in deployment secret stores; `.env.example` contains names/defaults only.
- Financial mutations require server-side authorization, validation, auditability and idempotency.
- Approved/published financial history is immutable; corrections use reversal/adjustment records.
- Do not log passwords, cookies, OTP values, access tokens or private file contents.
- Production data must never be copied into local fixtures.

## Reporting

Until a private security reporting channel is configured, do not publish exploit details in a public issue. Contact the repository owner privately.
