-- Deterministic development-only seed for the first real BoardOps checkpoint.
-- Never use these identities or values in production.

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('seed_profile', 'phase-02-development-only', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

INSERT INTO institutions (id, name, currency, timezone)
VALUES ('inst-boardops-demo', 'BoardOps Institute', 'INR', 'Asia/Kolkata')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  currency = excluded.currency,
  timezone = excluded.timezone,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO users (
  id, institution_id, email, name, role, status,
  institution_user_id, phone, room, gender, joined_at
) VALUES
  ('user-admin-demo', 'inst-boardops-demo', 'admin@boardops.local', 'Sahid Admin', 'ADMIN', 'ACTIVE', 'ADM-001', '+91 90000 00001', 'Office', 'MALE', '2026-01-01T00:00:00Z'),
  ('user-001', 'inst-boardops-demo', 'arjun@boardops.local', 'Arjun Mehta', 'USER', 'ACTIVE', 'RES-001', '+91 90000 00101', 'A-101', 'MALE', '2026-01-12T00:00:00Z'),
  ('user-002', 'inst-boardops-demo', 'ananya@boardops.local', 'Ananya Rao', 'USER', 'ACTIVE', 'RES-002', '+91 90000 00102', 'A-102', 'FEMALE', '2026-02-03T00:00:00Z'),
  ('user-003', 'inst-boardops-demo', 'kabir@boardops.local', 'Kabir Singh', 'USER', 'ACTIVE', 'RES-003', '+91 90000 00103', 'B-201', 'MALE', '2026-02-18T00:00:00Z'),
  ('user-004', 'inst-boardops-demo', 'meera@boardops.local', 'Meera Nair', 'USER', 'ACTIVE', 'RES-004', '+91 90000 00104', 'B-202', 'FEMALE', '2026-03-02T00:00:00Z'),
  ('user-005', 'inst-boardops-demo', 'ishaan@boardops.local', 'Ishaan Das', 'USER', 'PENDING', 'RES-005', '+91 90000 00105', 'C-301', 'MALE', '2026-08-28T00:00:00Z'),
  ('user-006', 'inst-boardops-demo', 'riya@boardops.local', 'Riya Sen', 'USER', 'SUSPENDED', 'RES-006', '+91 90000 00106', 'C-302', 'FEMALE', '2026-04-10T00:00:00Z')
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  name = excluded.name,
  role = excluded.role,
  status = excluded.status,
  institution_user_id = excluded.institution_user_id,
  phone = excluded.phone,
  room = excluded.room,
  gender = excluded.gender,
  joined_at = excluded.joined_at,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail, created_at)
VALUES
  ('audit-seed-001', 'user-admin-demo', 'DOMAIN_SEEDED', 'System', 'phase-02', 'Phase 02 local demo data created', '2026-08-29T09:00:00Z'),
  ('audit-seed-002', 'user-admin-demo', 'RESIDENT_REVIEWED', 'User', 'user-004', 'Resident profile verified for local demo', '2026-08-29T09:30:00Z'),
  ('audit-seed-003', 'user-admin-demo', 'RESIDENT_PENDING', 'User', 'user-005', 'Registration awaiting review', '2026-08-29T10:00:00Z')
ON CONFLICT(id) DO NOTHING;
