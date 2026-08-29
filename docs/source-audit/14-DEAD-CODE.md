# 14 — Dead code, obsolete runtime and repository junk

## Intentionally not migrated

The reference repository contains material that is not authoritative product implementation and must stay out of the rewrite:

- `.zscripts/` development/process helpers;
- `agent-ctx/` and related AI/agent context dumps;
- `tool-results/` execution artifacts;
- `backups/` local database backups;
- committed local `db/` database artifacts;
- `dev.log` and transient logs;
- root `.env`;
- `Caddyfile` / obsolete deployment configuration;
- upload/design/export artifacts and old archives;
- temporary experimental scripts/mini servers that have no verified product role;
- generated Prisma output/build artifacts.

## Runtime implementations intentionally replaced, not copied

- hard-coded shell/SQLite system backup route;
- filesystem avatar storage;
- `/tmp` JSON rate limiter;
- request-triggered maintenance/cleanup as a scheduler;
- duplicate payment-refund implementation once the canonical Refund domain exists;
- localStorage bearer-token compatibility path.

Product intent (backup/export, avatar, rate limiting, scheduled work, refunds, sessions) is preserved through target-native implementations; only obsolete mechanisms are removed.
