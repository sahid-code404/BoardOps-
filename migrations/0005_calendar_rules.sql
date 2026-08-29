-- Phase 02 checkpoint 5: institution calendar and typed holiday meal rules.
-- Calendar rules can disable meal service without introducing financial behavior.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'HOLIDAY' CHECK (type IN ('HOLIDAY', 'FESTIVAL', 'SPECIAL_MEAL', 'BILLING_DAY', 'REFUND_DAY', 'MAINTENANCE')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  meals_disabled INTEGER NOT NULL DEFAULT 1 CHECK (meals_disabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (length(start_date) = 10),
  CHECK (length(end_date) = 10),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_institution_range
  ON calendar_events(institution_id, status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_meal_rules
  ON calendar_events(institution_id, meals_disabled, status, start_date, end_date);

CREATE TABLE IF NOT EXISTS calendar_meal_effects (
  event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE RESTRICT,
  meal_entry_id TEXT NOT NULL REFERENCES meal_entries(id) ON DELETE RESTRICT,
  prior_status TEXT NOT NULL CHECK (prior_status IN ('ON', 'OFF', 'LOCKED')),
  prior_original_state TEXT NOT NULL CHECK (prior_original_state IN ('ON', 'OFF')),
  prior_locked INTEGER NOT NULL CHECK (prior_locked IN (0, 1)),
  prior_updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reverted_at TEXT,
  PRIMARY KEY (event_id, meal_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_meal_effects_entry
  ON calendar_meal_effects(meal_entry_id, reverted_at);

-- Active meal-disabling rules may not overlap. This keeps application and
-- reversal deterministic instead of making the result depend on event order.
CREATE TRIGGER IF NOT EXISTS trg_calendar_no_disabled_overlap_insert
BEFORE INSERT ON calendar_events
WHEN NEW.status = 'ACTIVE'
  AND NEW.meals_disabled = 1
  AND EXISTS (
    SELECT 1
    FROM calendar_events ce
    WHERE ce.institution_id = NEW.institution_id
      AND ce.status = 'ACTIVE'
      AND ce.meals_disabled = 1
      AND ce.start_date <= NEW.end_date
      AND ce.end_date >= NEW.start_date
  )
BEGIN
  SELECT RAISE(ABORT, 'CALENDAR_MEAL_DISABLE_OVERLAP');
END;

CREATE TRIGGER IF NOT EXISTS trg_calendar_no_disabled_overlap_update
BEFORE UPDATE OF start_date, end_date, meals_disabled, status ON calendar_events
WHEN NEW.status = 'ACTIVE'
  AND NEW.meals_disabled = 1
  AND EXISTS (
    SELECT 1
    FROM calendar_events ce
    WHERE ce.id <> NEW.id
      AND ce.institution_id = NEW.institution_id
      AND ce.status = 'ACTIVE'
      AND ce.meals_disabled = 1
      AND ce.start_date <= NEW.end_date
      AND ce.end_date >= NEW.start_date
  )
BEGIN
  SELECT RAISE(ABORT, 'CALENDAR_MEAL_DISABLE_OVERLAP');
END;

-- Prevent a meal from being re-enabled/unlocked while an active calendar rule
-- disables service for its date. Application APIs also return a friendly 422;
-- this trigger is the D1 backstop.
CREATE TRIGGER IF NOT EXISTS trg_calendar_guard_meal_entry_update
BEFORE UPDATE OF status, locked ON meal_entries
WHEN EXISTS (
    SELECT 1
    FROM calendar_events ce
    JOIN users u ON u.id = NEW.user_id
    WHERE ce.institution_id = u.institution_id
      AND ce.status = 'ACTIVE'
      AND ce.meals_disabled = 1
      AND NEW.service_date BETWEEN ce.start_date AND ce.end_date
  )
  AND (NEW.status <> 'OFF' OR NEW.locked <> 1)
BEGIN
  SELECT RAISE(ABORT, 'CALENDAR_MEAL_SERVICE_DISABLED');
END;

CREATE TRIGGER IF NOT EXISTS trg_calendar_guard_guest_insert
BEFORE INSERT ON guest_meals
WHEN NEW.status = 'ACTIVE'
  AND EXISTS (
    SELECT 1
    FROM calendar_events ce
    WHERE ce.institution_id = NEW.institution_id
      AND ce.status = 'ACTIVE'
      AND ce.meals_disabled = 1
      AND NEW.service_date BETWEEN ce.start_date AND ce.end_date
  )
BEGIN
  SELECT RAISE(ABORT, 'CALENDAR_MEAL_SERVICE_DISABLED');
END;

-- Apply a newly-created disabling event to already-materialized meal entries.
CREATE TRIGGER IF NOT EXISTS trg_calendar_apply_existing_meals_insert
AFTER INSERT ON calendar_events
WHEN NEW.status = 'ACTIVE' AND NEW.meals_disabled = 1
BEGIN
  INSERT OR IGNORE INTO calendar_meal_effects
    (event_id, meal_entry_id, prior_status, prior_original_state, prior_locked, prior_updated_by)
  SELECT NEW.id, e.id, e.status, e.original_state, e.locked, e.updated_by
  FROM meal_entries e
  JOIN users u ON u.id = e.user_id
  JOIN meal_configurations m ON m.id = e.meal_id
  WHERE u.institution_id = NEW.institution_id
    AND m.institution_id = NEW.institution_id
    AND e.service_date BETWEEN NEW.start_date AND NEW.end_date;

  INSERT INTO meal_history
    (id, meal_entry_id, meal_id, user_id, old_status, new_status, changed_by, trigger_source, reason)
  SELECT lower(hex(randomblob(16))), e.id, e.meal_id, e.user_id, e.status, 'OFF', NEW.created_by, 'SYSTEM',
         'Calendar event ' || NEW.id || ': ' || NEW.name
  FROM meal_entries e
  JOIN calendar_meal_effects effect ON effect.meal_entry_id = e.id
  WHERE effect.event_id = NEW.id
    AND effect.reverted_at IS NULL
    AND e.status <> 'OFF';

  UPDATE meal_entries
  SET status = 'OFF',
      locked = 1,
      updated_by = NEW.created_by,
      updated_at = CURRENT_TIMESTAMP
  WHERE id IN (
    SELECT meal_entry_id
    FROM calendar_meal_effects
    WHERE event_id = NEW.id AND reverted_at IS NULL
  );
END;

-- Also support an event being enabled by an administrative migration or future
-- API version. The current UI treats meal-impacting rules as immutable.
CREATE TRIGGER IF NOT EXISTS trg_calendar_apply_existing_meals_enable
AFTER UPDATE OF meals_disabled, status ON calendar_events
WHEN NEW.status = 'ACTIVE'
  AND NEW.meals_disabled = 1
  AND (OLD.status <> 'ACTIVE' OR OLD.meals_disabled = 0)
BEGIN
  INSERT OR IGNORE INTO calendar_meal_effects
    (event_id, meal_entry_id, prior_status, prior_original_state, prior_locked, prior_updated_by)
  SELECT NEW.id, e.id, e.status, e.original_state, e.locked, e.updated_by
  FROM meal_entries e
  JOIN users u ON u.id = e.user_id
  JOIN meal_configurations m ON m.id = e.meal_id
  WHERE u.institution_id = NEW.institution_id
    AND m.institution_id = NEW.institution_id
    AND e.service_date BETWEEN NEW.start_date AND NEW.end_date;

  INSERT INTO meal_history
    (id, meal_entry_id, meal_id, user_id, old_status, new_status, changed_by, trigger_source, reason)
  SELECT lower(hex(randomblob(16))), e.id, e.meal_id, e.user_id, e.status, 'OFF', COALESCE(NEW.updated_by, NEW.created_by), 'SYSTEM',
         'Calendar event ' || NEW.id || ': ' || NEW.name
  FROM meal_entries e
  JOIN calendar_meal_effects effect ON effect.meal_entry_id = e.id
  WHERE effect.event_id = NEW.id
    AND effect.reverted_at IS NULL
    AND e.status <> 'OFF';

  UPDATE meal_entries
  SET status = 'OFF',
      locked = 1,
      updated_by = COALESCE(NEW.updated_by, NEW.created_by),
      updated_at = CURRENT_TIMESTAMP
  WHERE id IN (
    SELECT meal_entry_id
    FROM calendar_meal_effects
    WHERE event_id = NEW.id AND reverted_at IS NULL
  );
END;

-- Entries are materialized lazily. If one is created while service is disabled,
-- capture its prior intent and immediately force the effective state OFF/locked.
CREATE TRIGGER IF NOT EXISTS trg_calendar_apply_new_meal_entry
AFTER INSERT ON meal_entries
WHEN EXISTS (
  SELECT 1
  FROM calendar_events ce
  JOIN users u ON u.id = NEW.user_id
  WHERE ce.institution_id = u.institution_id
    AND ce.status = 'ACTIVE'
    AND ce.meals_disabled = 1
    AND NEW.service_date BETWEEN ce.start_date AND ce.end_date
)
BEGIN
  INSERT OR IGNORE INTO calendar_meal_effects
    (event_id, meal_entry_id, prior_status, prior_original_state, prior_locked, prior_updated_by)
  SELECT ce.id, NEW.id, NEW.status, NEW.original_state, NEW.locked, NEW.updated_by
  FROM calendar_events ce
  JOIN users u ON u.id = NEW.user_id
  WHERE ce.institution_id = u.institution_id
    AND ce.status = 'ACTIVE'
    AND ce.meals_disabled = 1
    AND NEW.service_date BETWEEN ce.start_date AND ce.end_date
  LIMIT 1;

  INSERT INTO meal_history
    (id, meal_entry_id, meal_id, user_id, old_status, new_status, changed_by, trigger_source, reason)
  SELECT lower(hex(randomblob(16))), NEW.id, NEW.meal_id, NEW.user_id, NEW.status, 'OFF', ce.created_by, 'SYSTEM',
         'Calendar event ' || ce.id || ': ' || ce.name
  FROM calendar_events ce
  JOIN users u ON u.id = NEW.user_id
  WHERE ce.institution_id = u.institution_id
    AND ce.status = 'ACTIVE'
    AND ce.meals_disabled = 1
    AND NEW.service_date BETWEEN ce.start_date AND ce.end_date
    AND NEW.status <> 'OFF'
  LIMIT 1;

  UPDATE meal_entries
  SET status = 'OFF',
      locked = 1,
      updated_by = (
        SELECT ce.created_by
        FROM calendar_events ce
        JOIN users u ON u.id = NEW.user_id
        WHERE ce.institution_id = u.institution_id
          AND ce.status = 'ACTIVE'
          AND ce.meals_disabled = 1
          AND NEW.service_date BETWEEN ce.start_date AND ce.end_date
        LIMIT 1
      ),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

-- Archiving a meal-disabling event restores only still-editable entries whose
-- resident/original intent did not change while the event was active. Past
-- cutoffs remain historical; approved leave changes original_state and therefore
-- are never undone by calendar reversal.
CREATE TRIGGER IF NOT EXISTS trg_calendar_restore_meals_archive
AFTER UPDATE OF status ON calendar_events
WHEN OLD.status = 'ACTIVE'
  AND OLD.meals_disabled = 1
  AND NEW.status = 'ARCHIVED'
BEGIN
  INSERT INTO meal_history
    (id, meal_entry_id, meal_id, user_id, old_status, new_status, changed_by, trigger_source, reason)
  SELECT lower(hex(randomblob(16))), e.id, e.meal_id, e.user_id, e.status, effect.prior_status,
         COALESCE(NEW.updated_by, NEW.created_by), 'SYSTEM',
         'Calendar event archived ' || NEW.id || ': ' || NEW.name
  FROM calendar_meal_effects effect
  JOIN meal_entries e ON e.id = effect.meal_entry_id
  WHERE effect.event_id = NEW.id
    AND effect.reverted_at IS NULL
    AND e.editable_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    AND e.original_state = effect.prior_original_state
    AND e.status <> effect.prior_status;

  UPDATE meal_entries
  SET status = (
        SELECT effect.prior_status
        FROM calendar_meal_effects effect
        WHERE effect.event_id = NEW.id AND effect.meal_entry_id = meal_entries.id
      ),
      locked = (
        SELECT effect.prior_locked
        FROM calendar_meal_effects effect
        WHERE effect.event_id = NEW.id AND effect.meal_entry_id = meal_entries.id
      ),
      updated_by = (
        SELECT effect.prior_updated_by
        FROM calendar_meal_effects effect
        WHERE effect.event_id = NEW.id AND effect.meal_entry_id = meal_entries.id
      ),
      updated_at = CURRENT_TIMESTAMP
  WHERE id IN (
    SELECT e.id
    FROM calendar_meal_effects effect
    JOIN meal_entries e ON e.id = effect.meal_entry_id
    WHERE effect.event_id = NEW.id
      AND effect.reverted_at IS NULL
      AND e.editable_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND e.original_state = effect.prior_original_state
  );

  UPDATE calendar_meal_effects
  SET reverted_at = CURRENT_TIMESTAMP
  WHERE event_id = NEW.id AND reverted_at IS NULL;
END;

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('calendar_rules_schema', '1', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
