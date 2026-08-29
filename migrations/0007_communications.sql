-- Phase 02 checkpoint 6: communications, notifications, and durable outbox.
-- In-app delivery is authoritative in D1. The outbox is the transactional bridge
-- for later Cloudflare Queue/email/push delivery; this migration does not fake
-- external delivery.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'INFO' CHECK (type IN ('INFO', 'WARNING', 'MAINTENANCE', 'EVENT')),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT')),
  target_audience TEXT NOT NULL DEFAULT 'ALL' CHECK (target_audience IN ('ALL', 'RESIDENTS', 'ADMINS')),
  is_pinned INTEGER NOT NULL DEFAULT 1 CHECK (is_pinned IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED')),
  published_at TEXT,
  scheduled_for TEXT,
  expires_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (length(title) BETWEEN 3 AND 200),
  CHECK (length(body) BETWEEN 5 AND 5000)
);

CREATE INDEX IF NOT EXISTS idx_announcements_institution_status
  ON announcements(institution_id, status, is_pinned DESC, published_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_expiry
  ON announcements(institution_id, expires_at, status);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'INFO' CHECK (type IN ('INFO', 'WARNING', 'SUCCESS', 'ERROR')),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT')),
  route TEXT,
  source_type TEXT,
  source_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_institution_created
  ON notifications(institution_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DISPATCHED', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dispatched_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON outbox_events(status, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_institution
  ON outbox_events(institution_id, created_at DESC);

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('communications_schema', '1', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
