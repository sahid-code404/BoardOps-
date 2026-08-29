-- Deterministic development-only seed for Phase 02 communications.
-- This seed creates in-app history only; it deliberately does not pretend to
-- dispatch external Queue/email/push delivery.

INSERT INTO announcements (
  id, institution_id, title, body, type, priority, target_audience,
  is_pinned, status, published_at, expires_at, created_by, updated_by
) VALUES (
  'announcement-welcome-001',
  'inst-boardops-demo',
  'Welcome to the BoardOps rewrite',
  'Resident operations, meals, leave, calendar and communications are available in this local checkpoint.',
  'INFO',
  'NORMAL',
  'ALL',
  1,
  'PUBLISHED',
  '2026-08-29T12:00:00Z',
  NULL,
  'user-admin-demo',
  'user-admin-demo'
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  body = excluded.body,
  type = excluded.type,
  priority = excluded.priority,
  target_audience = excluded.target_audience,
  is_pinned = excluded.is_pinned,
  status = excluded.status,
  published_at = excluded.published_at,
  expires_at = excluded.expires_at,
  updated_by = excluded.updated_by,
  updated_at = CURRENT_TIMESTAMP;

INSERT OR IGNORE INTO notifications (
  id, institution_id, user_id, title, description, type, priority,
  route, source_type, source_id, created_at
)
SELECT
  'notification-welcome-' || id,
  institution_id,
  id,
  '📢 Welcome to the BoardOps rewrite',
  'Resident operations, meals, leave, calendar and communications are available in this local checkpoint.',
  'INFO',
  'NORMAL',
  '/announcements',
  'ANNOUNCEMENT',
  'announcement-welcome-001',
  '2026-08-29T12:00:00Z'
FROM users
WHERE institution_id = 'inst-boardops-demo'
  AND status = 'ACTIVE';

INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail, created_at)
VALUES (
  'audit-seed-009',
  'user-admin-demo',
  'COMMUNICATIONS_SEEDED',
  'System',
  'phase-02-communications',
  'One published announcement and deterministic in-app notifications seeded for communications testing',
  '2026-08-29T12:05:00Z'
)
ON CONFLICT(id) DO NOTHING;
