-- Phase 02 checkpoint 4: operational meal workflows.
-- Adds presets, guest meals, and leave applications without introducing financial tables.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meal_presets (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(institution_id, name)
);

CREATE TABLE IF NOT EXISTS meal_preset_items (
  id TEXT PRIMARY KEY,
  preset_id TEXT NOT NULL REFERENCES meal_presets(id) ON DELETE CASCADE,
  meal_id TEXT NOT NULL REFERENCES meal_configurations(id) ON DELETE RESTRICT,
  desired_state TEXT NOT NULL CHECK (desired_state IN ('ON', 'OFF')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(preset_id, meal_id)
);

CREATE INDEX IF NOT EXISTS idx_meal_presets_institution
  ON meal_presets(institution_id, name);

CREATE TABLE IF NOT EXISTS guest_meals (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  meal_id TEXT NOT NULL REFERENCES meal_configurations(id) ON DELETE RESTRICT,
  service_date TEXT NOT NULL,
  guest_count INTEGER NOT NULL CHECK (guest_count BETWEEN 1 AND 100),
  guest_name TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  cancelled_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guest_meals_institution_date
  ON guest_meals(institution_id, service_date, status);
CREATE INDEX IF NOT EXISTS idx_guest_meals_meal_date
  ON guest_meals(meal_id, service_date, status);

CREATE TABLE IF NOT EXISTS leave_applications (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  meal_type TEXT NOT NULL DEFAULT 'ALL' CHECK (meal_type IN ('ALL', 'SPECIFIC')),
  meal_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  admin_notes TEXT,
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leave_applications_institution_status
  ON leave_applications(institution_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_applications_user_created
  ON leave_applications(user_id, created_at DESC);

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('meal_operations_schema', '1', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
