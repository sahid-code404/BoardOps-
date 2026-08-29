-- Phase 02 checkpoint 8: resident-submitted payments, administrator review, and R2 proof metadata.
-- Product workflow follows the reference behavior: resident submits PENDING -> admin APPROVES/REJECTS/VOIDS.
-- The 0008 payments table remains the immutable accounting posting created only after approval.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS payment_submissions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  method TEXT NOT NULL CHECK (method IN ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'WALLET')),
  reference TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'VOID')),
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  review_note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_submissions_institution_status
  ON payment_submissions(institution_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_user
  ON payment_submissions(user_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS payment_proofs (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES payment_submissions(id) ON DELETE RESTRICT,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (typeof(size_bytes) = 'integer' AND size_bytes > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_submission
  ON payment_proofs(submission_id, created_at ASC);

CREATE TABLE IF NOT EXISTS payment_initial_reviews (
  submission_id TEXT PRIMARY KEY REFERENCES payment_submissions(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED', 'VOID')),
  reviewed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_posting_links (
  submission_id TEXT PRIMARY KEY REFERENCES payment_submissions(id) ON DELETE RESTRICT,
  payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_void_links (
  submission_id TEXT PRIMARY KEY REFERENCES payment_submissions(id) ON DELETE RESTRICT,
  reversal_id TEXT NOT NULL UNIQUE REFERENCES payment_reversals(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS trg_payment_submission_economic_fields_immutable
BEFORE UPDATE ON payment_submissions
WHEN NEW.institution_id <> OLD.institution_id
  OR NEW.user_id <> OLD.user_id
  OR NEW.amount_minor <> OLD.amount_minor
  OR NEW.currency <> OLD.currency
  OR NEW.method <> OLD.method
  OR NEW.reference IS NOT OLD.reference
  OR NEW.note IS NOT OLD.note
  OR NEW.submitted_at <> OLD.submitted_at
BEGIN
  SELECT RAISE(ABORT, 'PAYMENT_SUBMISSION_ECONOMICS_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_submission_valid_status_transition
BEFORE UPDATE OF status ON payment_submissions
WHEN NOT (
  NEW.status = OLD.status
  OR (OLD.status = 'PENDING' AND NEW.status IN ('APPROVED', 'REJECTED', 'VOID'))
  OR (OLD.status = 'APPROVED' AND NEW.status = 'VOID')
)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_PAYMENT_STATUS_TRANSITION');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_submissions_no_delete
BEFORE DELETE ON payment_submissions
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_proofs_no_update
BEFORE UPDATE ON payment_proofs
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_proofs_no_delete
BEFORE DELETE ON payment_proofs
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_initial_reviews_no_update
BEFORE UPDATE ON payment_initial_reviews
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_initial_reviews_no_delete
BEFORE DELETE ON payment_initial_reviews
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_posting_links_no_update
BEFORE UPDATE ON payment_posting_links
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_posting_links_no_delete
BEFORE DELETE ON payment_posting_links
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_void_links_no_update
BEFORE UPDATE ON payment_void_links
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_void_links_no_delete
BEFORE DELETE ON payment_void_links
BEGIN
  SELECT RAISE(ABORT, 'FINANCIAL_HISTORY_IMMUTABLE');
END;

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('payment_review_schema', '1', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
