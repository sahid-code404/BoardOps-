-- Phase 02 checkpoint 7: canonical payment posting + immutable resident fund ledger.
-- Money is stored only as integer minor units. Posted financial facts are append-only.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounting_commands (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  command_type TEXT NOT NULL CHECK (command_type IN ('PAYMENT_POST', 'PAYMENT_REVERSE')),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_entity_id TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(institution_id, command_type, idempotency_key)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  method TEXT NOT NULL CHECK (method IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'OTHER')),
  reference TEXT,
  note TEXT,
  posted_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_institution_posted
  ON payments(institution_id, posted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user_posted
  ON payments(user_id, posted_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS payment_reversals (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  reversed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reversed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_reversals_institution
  ON payment_reversals(institution_id, reversed_at DESC);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('PAYMENT', 'PAYMENT_REVERSAL', 'BILL_SETTLEMENT', 'REFUND', 'ADJUSTMENT')),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  command_id TEXT NOT NULL REFERENCES accounting_commands(id) ON DELETE RESTRICT,
  narrative TEXT NOT NULL,
  posted_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_user_posted
  ON ledger_entries(user_id, posted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_institution_posted
  ON ledger_entries(institution_id, posted_at DESC, id DESC);

CREATE TRIGGER IF NOT EXISTS trg_accounting_commands_no_update
BEFORE UPDATE ON accounting_commands
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_accounting_commands_no_delete
BEFORE DELETE ON accounting_commands
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_payments_no_update
BEFORE UPDATE ON payments
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_payments_no_delete
BEFORE DELETE ON payments
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_reversals_no_update
BEFORE UPDATE ON payment_reversals
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_reversals_no_delete
BEFORE DELETE ON payment_reversals
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_entries_no_update
BEFORE UPDATE ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_entries_no_delete
BEFORE DELETE ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('accounting_schema', '1', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
