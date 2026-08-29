# ADR-008 — Email provider abstraction

**Status:** Accepted

Application modules call `EmailService`; provider selection is behind the abstraction. OTP/reset/invitation cooldowns occur before provider choice so changing providers cannot bypass application limits. Delivery work can be queued and must be idempotent.

No OTP values or provider credentials may enter generic logs, frontend bundles or repository files.
