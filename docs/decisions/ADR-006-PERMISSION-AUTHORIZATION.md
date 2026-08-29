# ADR-006 — Permission-based authorization

**Status:** Accepted

Roles are collections of permissions; business actions authorize explicit permissions rather than comparing role-name strings throughout the application. The Worker is the enforcement boundary. Frontend visibility is convenience only and never authorization.

The source's `User.role` string and separate Role/Permission tables are consolidated into one canonical target model during Phase 04.
