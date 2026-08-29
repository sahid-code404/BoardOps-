# ADR-009 — Durable asynchronous and business workflows

**Status:** Accepted

Cloudflare Queues carry asynchronous events. Cloudflare Workflows own durable multi-step processes such as monthly closing when retries/resumability/persisted progress are needed. Scheduled maintenance uses platform scheduling rather than piggybacking on GET requests.

D1 remains the authoritative transactional boundary; external side effects follow durable state through outbox/event patterns where atomic cross-system writes are impossible.
