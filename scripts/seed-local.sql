-- Deterministic development-only seed for the Phase 02 calendar/holiday checkpoint.
-- Never use these identities or values in production.

INSERT INTO app_schema_metadata (key, value, updated_at)
VALUES ('seed_profile', 'phase-02-calendar-development-only', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

INSERT INTO institutions (id, name, currency, timezone)
VALUES ('inst-boardops-demo', 'BoardOps Institute', 'INR', 'Asia/Kolkata')
ON CONFLICT(id) DO UPDATE SET name = excluded.name, currency = excluded.currency, timezone = excluded.timezone, updated_at = CURRENT_TIMESTAMP;

INSERT INTO users (id, institution_id, email, name, role, status, institution_user_id, phone, room, gender, joined_at) VALUES
  ('user-admin-demo', 'inst-boardops-demo', 'admin@boardops.local', 'Sahid Admin', 'ADMIN', 'ACTIVE', 'ADM-001', '+91 90000 00001', 'Office', 'MALE', '2026-01-01T00:00:00Z'),
  ('user-001', 'inst-boardops-demo', 'arjun@boardops.local', 'Arjun Mehta', 'USER', 'ACTIVE', 'RES-001', '+91 90000 00101', 'A-101', 'MALE', '2026-01-12T00:00:00Z'),
  ('user-002', 'inst-boardops-demo', 'ananya@boardops.local', 'Ananya Rao', 'USER', 'ACTIVE', 'RES-002', '+91 90000 00102', 'A-102', 'FEMALE', '2026-02-03T00:00:00Z'),
  ('user-003', 'inst-boardops-demo', 'kabir@boardops.local', 'Kabir Singh', 'USER', 'ACTIVE', 'RES-003', '+91 90000 00103', 'B-201', 'MALE', '2026-02-18T00:00:00Z'),
  ('user-004', 'inst-boardops-demo', 'meera@boardops.local', 'Meera Nair', 'USER', 'ACTIVE', 'RES-004', '+91 90000 00104', 'B-202', 'FEMALE', '2026-03-02T00:00:00Z'),
  ('user-005', 'inst-boardops-demo', 'ishaan@boardops.local', 'Ishaan Das', 'USER', 'PENDING', 'RES-005', '+91 90000 00105', 'C-301', 'MALE', NULL),
  ('user-006', 'inst-boardops-demo', 'riya@boardops.local', 'Riya Sen', 'USER', 'SUSPENDED', 'RES-006', '+91 90000 00106', 'C-302', 'FEMALE', '2026-04-10T00:00:00Z'),
  ('user-007', 'inst-boardops-demo', 'dev@boardops.local', 'Dev Malhotra', 'USER', 'ARCHIVED', 'RES-007', '+91 90000 00107', 'D-401', 'MALE', '2026-05-14T00:00:00Z')
ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, role = excluded.role, status = excluded.status, institution_user_id = excluded.institution_user_id, phone = excluded.phone, room = excluded.room, gender = excluded.gender, joined_at = excluded.joined_at, updated_at = CURRENT_TIMESTAMP;

INSERT INTO registration_requests (id, user_id, cycle, review_status, requested_fields_json, reason, submitted_at, reviewed_by, reviewed_at) VALUES
  ('registration-004-1', 'user-004', 1, 'APPROVED', NULL, NULL, '2026-03-01T09:00:00Z', 'user-admin-demo', '2026-03-02T08:30:00Z'),
  ('registration-005-1', 'user-005', 1, 'PENDING_REVIEW', NULL, NULL, '2026-08-28T13:15:00Z', NULL, NULL),
  ('registration-007-1', 'user-007', 1, 'APPROVED', NULL, NULL, '2026-05-13T10:00:00Z', 'user-admin-demo', '2026-05-14T08:00:00Z')
ON CONFLICT(user_id, cycle) DO UPDATE SET review_status = excluded.review_status, requested_fields_json = excluded.requested_fields_json, reason = excluded.reason, submitted_at = excluded.submitted_at, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at, updated_at = CURRENT_TIMESTAMP;

INSERT INTO resident_status_events (id, user_id, actor_user_id, from_status, to_status, action, reason, created_at) VALUES
  ('status-event-006-suspend', 'user-006', 'user-admin-demo', 'ACTIVE', 'SUSPENDED', 'SUSPEND', 'Local demo suspension for lifecycle testing', '2026-08-20T11:00:00Z'),
  ('status-event-007-archive', 'user-007', 'user-admin-demo', 'ACTIVE', 'ARCHIVED', 'ARCHIVE', 'Local demo archive for restore testing', '2026-08-25T12:00:00Z')
ON CONFLICT(id) DO NOTHING;

INSERT INTO meal_configurations (
  id, institution_id, name, display_name, description, icon, color, meal_type, display_order,
  default_state, default_visibility, cutoff_strategy, cutoff_time, cutoff_offset_minutes, start_time, end_time, status
) VALUES
  ('meal-breakfast', 'inst-boardops-demo', 'breakfast', 'Breakfast', 'Morning meal service', '🌅', '#f59e0b', 'REGULAR', 10, 'ON', 'VISIBLE', 'PREVIOUS_DAY', '22:00', 0, '07:30', '09:00', 'ACTIVE'),
  ('meal-lunch', 'inst-boardops-demo', 'lunch', 'Lunch', 'Midday meal service', '🍛', '#10b981', 'REGULAR', 20, 'ON', 'VISIBLE', 'SAME_DAY', '08:00', 0, '12:30', '14:00', 'ACTIVE'),
  ('meal-dinner', 'inst-boardops-demo', 'dinner', 'Dinner', 'Evening meal service', '🌙', '#8b5cf6', 'REGULAR', 30, 'ON', 'VISIBLE', 'SAME_DAY', '14:00', 0, '19:30', '21:00', 'ACTIVE')
ON CONFLICT(institution_id, name) DO UPDATE SET display_name = excluded.display_name, description = excluded.description, icon = excluded.icon, color = excluded.color, meal_type = excluded.meal_type, display_order = excluded.display_order, default_state = excluded.default_state, default_visibility = excluded.default_visibility, cutoff_strategy = excluded.cutoff_strategy, cutoff_time = excluded.cutoff_time, cutoff_offset_minutes = excluded.cutoff_offset_minutes, start_time = excluded.start_time, end_time = excluded.end_time, status = excluded.status, updated_at = CURRENT_TIMESTAMP;

INSERT INTO meal_presets (id, institution_id, name, description) VALUES
  ('preset-all-on', 'inst-boardops-demo', 'All meals', 'Turn every editable meal ON'),
  ('preset-all-off', 'inst-boardops-demo', 'Skip all', 'Turn every editable meal OFF'),
  ('preset-lunch-only', 'inst-boardops-demo', 'Lunch only', 'Breakfast and dinner OFF, lunch ON')
ON CONFLICT(institution_id, name) DO UPDATE SET description = excluded.description, updated_at = CURRENT_TIMESTAMP;

INSERT INTO meal_preset_items (id, preset_id, meal_id, desired_state) VALUES
  ('preset-all-on-breakfast', 'preset-all-on', 'meal-breakfast', 'ON'),
  ('preset-all-on-lunch', 'preset-all-on', 'meal-lunch', 'ON'),
  ('preset-all-on-dinner', 'preset-all-on', 'meal-dinner', 'ON'),
  ('preset-all-off-breakfast', 'preset-all-off', 'meal-breakfast', 'OFF'),
  ('preset-all-off-lunch', 'preset-all-off', 'meal-lunch', 'OFF'),
  ('preset-all-off-dinner', 'preset-all-off', 'meal-dinner', 'OFF'),
  ('preset-lunch-only-breakfast', 'preset-lunch-only', 'meal-breakfast', 'OFF'),
  ('preset-lunch-only-lunch', 'preset-lunch-only', 'meal-lunch', 'ON'),
  ('preset-lunch-only-dinner', 'preset-lunch-only', 'meal-dinner', 'OFF')
ON CONFLICT(preset_id, meal_id) DO UPDATE SET desired_state = excluded.desired_state;

INSERT INTO leave_applications (
  id, institution_id, user_id, start_date, end_date, reason, meal_type, meal_ids_json, status
) VALUES
  ('leave-demo-ananya-001', 'inst-boardops-demo', 'user-002', '2026-08-31', '2026-09-01', 'Family visit outside campus', 'ALL', '[]', 'PENDING')
ON CONFLICT(id) DO NOTHING;

INSERT INTO calendar_events (
  id, institution_id, name, description, type, start_date, end_date, meals_disabled, status, created_by, updated_by
) VALUES
  ('calendar-special-001', 'inst-boardops-demo', 'Festival Dinner', 'Special dinner service and campus gathering.', 'SPECIAL_MEAL', '2026-09-01', '2026-09-01', 0, 'ACTIVE', 'user-admin-demo', 'user-admin-demo'),
  ('calendar-closure-001', 'inst-boardops-demo', 'Founders Day', 'Institution holiday. Regular meal service is closed for the day.', 'HOLIDAY', '2026-09-02', '2026-09-02', 1, 'ACTIVE', 'user-admin-demo', 'user-admin-demo'),
  ('calendar-maintenance-001', 'inst-boardops-demo', 'Kitchen Deep Clean', 'Kitchen maintenance notice; service continues on the normal schedule.', 'MAINTENANCE', '2026-09-04', '2026-09-04', 0, 'ACTIVE', 'user-admin-demo', 'user-admin-demo')
ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, type = excluded.type, start_date = excluded.start_date, end_date = excluded.end_date, meals_disabled = excluded.meals_disabled, status = excluded.status, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP;

INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail, created_at) VALUES
  ('audit-seed-001', 'user-admin-demo', 'DOMAIN_SEEDED', 'System', 'phase-02', 'Phase 02 local demo data created', '2026-08-29T09:00:00Z'),
  ('audit-seed-002', 'user-admin-demo', 'RESIDENT_REVIEWED', 'User', 'user-004', 'Resident profile verified for local demo', '2026-08-29T09:30:00Z'),
  ('audit-seed-003', 'user-admin-demo', 'RESIDENT_PENDING', 'User', 'user-005', 'Registration awaiting review', '2026-08-29T10:00:00Z'),
  ('audit-seed-004', 'user-admin-demo', 'RESIDENT_SUSPEND', 'User', 'user-006', 'Seeded suspended resident for lifecycle testing', '2026-08-29T10:05:00Z'),
  ('audit-seed-005', 'user-admin-demo', 'RESIDENT_ARCHIVE', 'User', 'user-007', 'Seeded archived resident for restore testing', '2026-08-29T10:10:00Z'),
  ('audit-seed-006', 'user-admin-demo', 'MEAL_CONFIG_SEEDED', 'MealConfiguration', 'meal-breakfast', 'Breakfast, lunch and dinner configuration seeded for the meals checkpoint', '2026-08-29T10:15:00Z'),
  ('audit-seed-007', 'user-admin-demo', 'MEAL_OPERATIONS_SEEDED', 'System', 'phase-02-meal-operations', 'Presets and one pending leave application seeded for operational testing', '2026-08-29T10:20:00Z'),
  ('audit-seed-008', 'user-admin-demo', 'CALENDAR_SEEDED', 'System', 'phase-02-calendar', 'Calendar demo events seeded, including one meal-service closure', '2026-08-29T10:25:00Z')
ON CONFLICT(id) DO NOTHING;
