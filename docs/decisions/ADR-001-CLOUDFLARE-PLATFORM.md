# ADR-001 — Cloudflare platform

**Status:** Accepted for rewrite baseline

## Decision
Use Cloudflare Workers for the API runtime, D1 for transactional relational data, R2 for binary objects, Queues for asynchronous events and Workflows for durable multi-step processes.

## Why
The target should avoid server-filesystem assumptions, keep deployment surface small and use Web Standard APIs. This also directly replaces source dependencies on local SQLite files, `/tmp` security state and public upload folders.

## Consequences
Node-only libraries require explicit justification. Production deployment remains gated until local/staging verification is complete.
