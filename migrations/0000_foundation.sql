-- Phase 00 only. Domain tables are intentionally deferred until Phase 02.
CREATE TABLE IF NOT EXISTS app_schema_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_schema_metadata (key, value)
VALUES ('foundation_schema', '1');
