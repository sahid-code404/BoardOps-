-- Development-only catalog seed for the reference-parity purchases checkpoint.
-- No purchase facts are seeded so testers can create/remove/restore them through the real workflow.

INSERT INTO units (id, institution_id, name, category, is_active) VALUES
  ('unit-piece', 'inst-boardops-demo', 'piece', 'QUANTITY', 1),
  ('unit-kg', 'inst-boardops-demo', 'kg', 'WEIGHT', 1),
  ('unit-g', 'inst-boardops-demo', 'g', 'WEIGHT', 1),
  ('unit-litre', 'inst-boardops-demo', 'litre', 'VOLUME', 1),
  ('unit-ml', 'inst-boardops-demo', 'ml', 'VOLUME', 1),
  ('unit-packet', 'inst-boardops-demo', 'packet', 'QUANTITY', 1)
ON CONFLICT(institution_id, name) DO UPDATE SET category = excluded.category, is_active = excluded.is_active, updated_at = CURRENT_TIMESTAMP;

INSERT INTO products (id, institution_id, name, slug, category, default_unit_id, is_active) VALUES
  ('product-rice', 'inst-boardops-demo', 'Rice', 'rice', 'GROCERY', 'unit-kg', 1),
  ('product-potato', 'inst-boardops-demo', 'Potato', 'potato', 'VEGETABLE', 'unit-kg', 1),
  ('product-onion', 'inst-boardops-demo', 'Onion', 'onion', 'VEGETABLE', 'unit-kg', 1),
  ('product-milk', 'inst-boardops-demo', 'Milk', 'milk', 'DAIRY', 'unit-litre', 1),
  ('product-eggs', 'inst-boardops-demo', 'Eggs', 'eggs', 'GROCERY', 'unit-piece', 1),
  ('product-oil', 'inst-boardops-demo', 'Cooking Oil', 'cooking-oil', 'GROCERY', 'unit-litre', 1)
ON CONFLICT(institution_id, name) DO UPDATE SET category = excluded.category, default_unit_id = excluded.default_unit_id, is_active = excluded.is_active, archived_at = NULL, updated_at = CURRENT_TIMESTAMP;

INSERT OR IGNORE INTO audit_events
  (id, actor_user_id, action, entity_type, entity_id, detail, created_at)
VALUES
  ('audit-seed-purchases-001', 'user-admin-demo', 'PURCHASE_CATALOG_SEEDED', 'System', 'phase-02-purchases', '{"units":6,"products":6,"seed":true}', '2026-08-29T14:35:00Z');

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('seed_purchase_catalog_profile', 'phase-02-reference-parity-purchases-development-only', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
