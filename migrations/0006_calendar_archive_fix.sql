-- Phase 02 calendar archive correction.
-- Move reversal out of the calendar status trigger so the API can execute the
-- archive, restoration, effect finalization and audit write in one explicit D1 batch.

PRAGMA foreign_keys = ON;

DROP TRIGGER IF EXISTS trg_calendar_restore_meals_archive;

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('calendar_archive_fix_schema', '1', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
