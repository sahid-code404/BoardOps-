-- Phase 02 identity/resident lifecycle continuation.
-- Registration review and resident status history are explicit, audited, and append-only.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS registration_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  cycle INTEGER NOT NULL DEFAULT 1 CHECK (cycle >= 1),
  review_status TEXT NOT NULL CHECK (review_status IN ('PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED')),
  requested_fields_json TEXT,
  reason TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, cycle)
);

CREATE INDEX IF NOT EXISTS idx_registration_requests_user_cycle
  ON registration_requests(user_id, cycle DESC);
CREATE INDEX IF NOT EXISTS idx_registration_requests_status
  ON registration_requests(review_status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS resident_status_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  from_status TEXT NOT NULL CHECK (from_status IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'ARCHIVED')),
  to_status TEXT NOT NULL CHECK (to_status IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'ARCHIVED')),
  action TEXT NOT NULL CHECK (action IN ('APPROVE', 'REQUEST_CHANGES', 'REJECT', 'SUSPEND', 'ACTIVATE', 'ARCHIVE', 'RESTORE')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resident_status_events_user
  ON resident_status_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resident_status_events_created
  ON resident_status_events(created_at DESC);

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('identity_lifecycle_schema', '1', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
