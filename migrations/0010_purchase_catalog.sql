-- Phase 02 checkpoint 10: reference-parity purchase catalog and shopping workflow.
-- Product behavior follows the pinned source. Financial facts use integer units and append-only correction events.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  name TEXT NOT NULL COLLATE NOCASE,
  category TEXT NOT NULL CHECK (category IN ('WEIGHT', 'VOLUME', 'QUANTITY', 'OTHER')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(institution_id, name)
);

CREATE INDEX IF NOT EXISTS idx_units_institution_active
  ON units(institution_id, is_active, category, name);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  name TEXT NOT NULL COLLATE NOCASE,
  slug TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'GENERAL',
  default_unit_id TEXT REFERENCES units(id) ON DELETE RESTRICT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(institution_id, name),
  UNIQUE(institution_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_products_institution_active
  ON products(institution_id, is_active, category, name);
CREATE INDEX IF NOT EXISTS idx_products_default_unit
  ON products(default_unit_id);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL CHECK (typeof(quantity_milli) = 'integer' AND quantity_milli > 0),
  unit TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  expense_date TEXT NOT NULL,
  paid_to TEXT,
  receipt_object_key TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('PURCHASE', 'MANUAL')),
  source_id TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(institution_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_institution_date
  ON expenses(institution_id, expense_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  vendor TEXT NOT NULL,
  purchase_date TEXT NOT NULL,
  total_amount_minor INTEGER NOT NULL CHECK (typeof(total_amount_minor) = 'integer' AND total_amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  receipt_object_key TEXT,
  notes TEXT,
  expense_id TEXT NOT NULL UNIQUE REFERENCES expenses(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(institution_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_purchases_institution_date
  ON purchases(institution_id, purchase_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  product_id TEXT REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'GENERAL',
  quantity_milli INTEGER NOT NULL CHECK (typeof(quantity_milli) = 'integer' AND quantity_milli > 0),
  unit TEXT NOT NULL,
  rate_minor INTEGER NOT NULL CHECK (typeof(rate_minor) = 'integer' AND rate_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (typeof(total_minor) = 'integer' AND total_minor >= 0),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (total_minor = CAST((quantity_milli * rate_minor + 500) / 1000 AS INTEGER))
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase
  ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product
  ON purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_name
  ON purchase_items(product_name);

CREATE TABLE IF NOT EXISTS purchase_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('RECORDED', 'VOIDED', 'RESTORED')),
  reason TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_events_purchase
  ON purchase_events(purchase_id, sequence DESC);

CREATE TABLE IF NOT EXISTS expense_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('RECORDED', 'VOIDED', 'RESTORED', 'ADJUSTED')),
  reason TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expense_events_expense
  ON expense_events(expense_id, sequence DESC);

-- Purchase/expense money and item snapshots are financial history. Correct them with append-only events.
CREATE TRIGGER IF NOT EXISTS trg_purchases_no_update
BEFORE UPDATE ON purchases
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_purchases_no_delete
BEFORE DELETE ON purchases
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_purchase_items_no_update
BEFORE UPDATE ON purchase_items
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_purchase_items_no_delete
BEFORE DELETE ON purchase_items
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_expenses_no_update
BEFORE UPDATE ON expenses
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_expenses_no_delete
BEFORE DELETE ON expenses
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_purchase_events_no_update
BEFORE UPDATE ON purchase_events
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_purchase_events_no_delete
BEFORE DELETE ON purchase_events
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_expense_events_no_update
BEFORE UPDATE ON expense_events
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_expense_events_no_delete
BEFORE DELETE ON expense_events
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('purchase_catalog_schema', '1', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
