-- Phase 02 core domain foundation.
-- D1 is authoritative. This migration intentionally does not add financial posting tables yet.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'USER')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'ARCHIVED')),
  institution_user_id TEXT,
  phone TEXT,
  room TEXT,
  gender TEXT CHECK (gender IS NULL OR gender IN ('MALE', 'FEMALE', 'OTHER')),
  avatar_url TEXT,
  joined_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_institution_status
  ON users(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_users_role_status
  ON users(role, status);
CREATE INDEX IF NOT EXISTS idx_users_room
  ON users(room);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
  ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor
  ON audit_events(actor_user_id, created_at DESC);

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('core_domain_schema', '1', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
