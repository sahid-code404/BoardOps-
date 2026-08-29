# 14 — Dead code / repository junk

## Do not migrate

The reference repository contains material that is not product source and must not be copied:

- `.zscripts/` process/dev helpers;
- `agent-ctx/` AI/agent context dumps;
- `tool-results/` execution artifacts;
- `backups/` database backup artifact(s);
- committed local `db/` database;
- `dev.log`;
- `Caddyfile` from obsolete deployment path;
- uploaded/design artifact files such as DFD exports;
- temporary download/upload/archive material;
- old experimental scripts/servers where not part of verified product behavior;
- root `.env`.

## Migration rule

Code is migrated only when a verified feature/parity row depends on it. The rewrite repository must not become an archive of the old project.

## Still to verify

The source contains numerous helper/scripts and generated/tool-result files. Each non-product root directory must receive an explicit `REMOVE` disposition before Phase 01 exit.
