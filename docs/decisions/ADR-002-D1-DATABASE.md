# ADR-002 — D1 transactional database

**Status:** Accepted

D1 is the authoritative relational store. R2/Google Drive are never databases. SQL migrations are explicit and immutable after release. Repositories use prepared statements and database constraints rather than ORM behavior as the primary integrity boundary.
