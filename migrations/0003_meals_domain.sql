-- Phase 02 checkpoint 3: meals + kitchen domain.
-- Financial tables are still intentionally absent.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meal_configurations (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT '🍽️',
  color TEXT NOT NULL DEFAULT '#8b5cf6',
  meal_type TEXT NOT NULL DEFAULT 'REGULAR',
  display_order INTEGER NOT NULL DEFAULT 0,
  default_state TEXT NOT NULL DEFAULT 'ON' CHECK (default_state IN ('ON', 'OFF')),
  default_visibility TEXT NOT NULL DEFAULT 'VISIBLE' CHECK (default_visibility IN ('VISIBLE', 'HIDDEN')),
  cutoff_strategy TEXT NOT NULL DEFAULT 'SAME_DAY' CHECK (cutoff_strategy IN ('PREVIOUS_DAY', 'SAME_DAY', 'CUSTOM_OFFSET')),
  cutoff_time TEXT NOT NULL DEFAULT '16:00',
  cutoff_offset_minutes INTEGER NOT NULL DEFAULT 0,
  start_time TEXT NOT NULL DEFAULT '08:00',
  end_time TEXT NOT NULL DEFAULT '10:00',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(institution_id, name)
);

CREATE INDEX IF NOT EXISTS idx_meal_configurations_institution_status
  ON meal_configurations(institution_id, status, display_order);

CREATE TABLE IF NOT EXISTS meal_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  meal_id TEXT NOT NULL REFERENCES meal_configurations(id) ON DELETE RESTRICT,
  service_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ON', 'OFF', 'LOCKED')),
  original_state TEXT NOT NULL CHECK (original_state IN ('ON', 'OFF')),
  editable_until TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, meal_id, service_date)
);

CREATE INDEX IF NOT EXISTS idx_meal_entries_user_date
  ON meal_entries(user_id, service_date);
CREATE INDEX IF NOT EXISTS idx_meal_entries_meal_date
  ON meal_entries(meal_id, service_date);
CREATE INDEX IF NOT EXISTS idx_meal_entries_editable_until
  ON meal_entries(editable_until, locked);

CREATE TABLE IF NOT EXISTS meal_history (
  id TEXT PRIMARY KEY,
  meal_entry_id TEXT NOT NULL REFERENCES meal_entries(id) ON DELETE RESTRICT,
  meal_id TEXT NOT NULL REFERENCES meal_configurations(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  old_status TEXT NOT NULL CHECK (old_status IN ('ON', 'OFF', 'LOCKED')),
  new_status TEXT NOT NULL CHECK (new_status IN ('ON', 'OFF', 'LOCKED')),
  changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('MANUAL', 'PRESET', 'ADMIN_OVERRIDE', 'LEAVE', 'SYSTEM')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meal_history_entry_created
  ON meal_history(meal_entry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meal_history_user_created
  ON meal_history(user_id, created_at DESC);

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('meals_domain_schema', '1', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
