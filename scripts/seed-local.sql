-- Deterministic development-only seed for Phase 00.
-- Real domain seed data begins only after the Phase 02 schema exists.
INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('seed_profile', 'development-only', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
