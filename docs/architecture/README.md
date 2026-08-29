# Target architecture

```text
Browser / Mobile Web
        |
        v
React + Vite
        |
        v
Typed API contracts
        |
        v
Cloudflare Worker / Hono
        |
   Application use cases
        |
   Domain services
        |
   Repositories
    /    |      \
   D1    R2    Queues
               |
           Workflows
```

## Boundaries

- Routes validate/authorize/serialize; they do not own accounting rules.
- Application use cases coordinate transactions and idempotency.
- Domain modules define state transitions and accounting invariants.
- Repositories own SQL and object-storage access.
- D1 is authoritative for transactional relational state.
- R2 contains operational binary objects; D1 stores metadata.
- Queues/Workflows deliver external/long-running work after authoritative state is durable.
- Frontend server state is TanStack Query; Zustand is limited to small local UI state.

Phase 00 creates only the runtime skeleton and schema metadata. Domain tables begin in Phase 02 after the source audit exits.
