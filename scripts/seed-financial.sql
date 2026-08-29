-- Development-only financial seed for the canonical payment/ledger checkpoint.
-- Amounts are integer minor units (paise for INR).

INSERT OR IGNORE INTO accounting_commands
  (id, institution_id, command_type, idempotency_key, request_hash, result_entity_id, created_by, created_at)
VALUES
  ('cmd-seed-payment-arjun', 'inst-boardops-demo', 'PAYMENT_POST', 'seed-payment-arjun', 'seed:arjun:250000', 'payment-seed-arjun', 'user-admin-demo', '2026-08-27T09:00:00Z'),
  ('cmd-seed-payment-ananya', 'inst-boardops-demo', 'PAYMENT_POST', 'seed-payment-ananya', 'seed:ananya:180000', 'payment-seed-ananya', 'user-admin-demo', '2026-08-27T09:05:00Z'),
  ('cmd-seed-payment-kabir', 'inst-boardops-demo', 'PAYMENT_POST', 'seed-payment-kabir', 'seed:kabir:300000', 'payment-seed-kabir', 'user-admin-demo', '2026-08-27T09:10:00Z');

INSERT OR IGNORE INTO payments
  (id, institution_id, user_id, amount_minor, currency, method, reference, note, posted_by, posted_at, created_at)
VALUES
  ('payment-seed-arjun', 'inst-boardops-demo', 'user-001', 250000, 'INR', 'UPI', 'UPI-DEMO-001', 'Opening development payment', 'user-admin-demo', '2026-08-27T09:00:00Z', '2026-08-27T09:00:00Z'),
  ('payment-seed-ananya', 'inst-boardops-demo', 'user-002', 180000, 'INR', 'BANK_TRANSFER', 'BANK-DEMO-002', 'Opening development payment', 'user-admin-demo', '2026-08-27T09:05:00Z', '2026-08-27T09:05:00Z'),
  ('payment-seed-kabir', 'inst-boardops-demo', 'user-003', 300000, 'INR', 'CASH', 'CASH-DEMO-003', 'Opening development payment', 'user-admin-demo', '2026-08-27T09:10:00Z', '2026-08-27T09:10:00Z');

INSERT OR IGNORE INTO ledger_entries
  (id, institution_id, user_id, direction, amount_minor, currency, entry_type, source_type, source_id, command_id, narrative, posted_by, posted_at, created_at)
VALUES
  ('ledger-seed-arjun', 'inst-boardops-demo', 'user-001', 'CREDIT', 250000, 'INR', 'PAYMENT', 'PAYMENT', 'payment-seed-arjun', 'cmd-seed-payment-arjun', 'Payment received via UPI', 'user-admin-demo', '2026-08-27T09:00:00Z', '2026-08-27T09:00:00Z'),
  ('ledger-seed-ananya', 'inst-boardops-demo', 'user-002', 'CREDIT', 180000, 'INR', 'PAYMENT', 'PAYMENT', 'payment-seed-ananya', 'cmd-seed-payment-ananya', 'Payment received via bank transfer', 'user-admin-demo', '2026-08-27T09:05:00Z', '2026-08-27T09:05:00Z'),
  ('ledger-seed-kabir', 'inst-boardops-demo', 'user-003', 'CREDIT', 300000, 'INR', 'PAYMENT', 'PAYMENT', 'payment-seed-kabir', 'cmd-seed-payment-kabir', 'Payment received in cash', 'user-admin-demo', '2026-08-27T09:10:00Z', '2026-08-27T09:10:00Z');

INSERT OR IGNORE INTO audit_events
  (id, actor_user_id, action, entity_type, entity_id, detail, created_at)
VALUES
  ('audit-seed-finance-001', 'user-admin-demo', 'PAYMENT_POST', 'Payment', 'payment-seed-arjun', '{"amountMinor":250000,"currency":"INR","seed":true}', '2026-08-27T09:00:00Z'),
  ('audit-seed-finance-002', 'user-admin-demo', 'PAYMENT_POST', 'Payment', 'payment-seed-ananya', '{"amountMinor":180000,"currency":"INR","seed":true}', '2026-08-27T09:05:00Z'),
  ('audit-seed-finance-003', 'user-admin-demo', 'PAYMENT_POST', 'Payment', 'payment-seed-kabir', '{"amountMinor":300000,"currency":"INR","seed":true}', '2026-08-27T09:10:00Z');

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('seed_financial_profile', 'phase-02-canonical-payments-development-only', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
