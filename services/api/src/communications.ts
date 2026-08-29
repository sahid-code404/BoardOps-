import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";

type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  APP_ENV: string;
};

type AppEnv = { Bindings: Bindings };

type SessionUser = {
  id: string;
  institutionId: string;
  role: "ADMIN" | "USER";
};

type AnnouncementType = "INFO" | "WARNING" | "MAINTENANCE" | "EVENT";
type Priority = "NORMAL" | "HIGH" | "URGENT";
type Audience = "ALL" | "RESIDENTS" | "ADMINS";
type AnnouncementStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

type AnnouncementRow = {
  id: string;
  institutionId: string;
  title: string;
  body: string;
  type: AnnouncementType;
  priority: Priority;
  targetAudience: Audience;
  isPinned: number;
  status: AnnouncementStatus;
  publishedAt: string | null;
  scheduledFor: string | null;
  expiresAt: string | null;
  createdBy: string;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
};

type NotificationRow = {
  id: string;
  title: string;
  description: string;
  type: "INFO" | "WARNING" | "SUCCESS" | "ERROR";
  priority: Priority;
  route: string | null;
  sourceType: string | null;
  sourceId: string | null;
  readAt: string | null;
  createdAt: string;
};

const SESSION_COOKIE = "boardops_session";
const ok = <T>(data: T) => ({ success: true as const, data });
const fail = (error: string) => ({ success: false as const, error });

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function currentUser(c: Context<AppEnv>): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return await c.env.DB
    .prepare(`
      SELECT u.id, u.institution_id AS institutionId, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.expires_at > CURRENT_TIMESTAMP
        AND u.status = 'ACTIVE'
      LIMIT 1
    `)
    .bind(await sha256(token))
    .first<SessionUser>();
}

function auditStatement(
  db: D1Database,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
): D1PreparedStatement {
  return db
    .prepare(`
      INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(crypto.randomUUID(), actorUserId, action, entityType, entityId, detail);
}

function parseIso(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date/time`);
  return date.toISOString();
}

function notificationType(type: AnnouncementType): "INFO" | "WARNING" {
  return type === "WARNING" || type === "MAINTENANCE" ? "WARNING" : "INFO";
}

function audienceWhere(audience: Audience): string {
  if (audience === "RESIDENTS") return "AND role = 'USER'";
  if (audience === "ADMINS") return "AND role = 'ADMIN'";
  return "";
}

function publishStatements(
  db: D1Database,
  announcement: {
    id: string;
    institutionId: string;
    title: string;
    body: string;
    type: AnnouncementType;
    priority: Priority;
    targetAudience: Audience;
  },
): D1PreparedStatement[] {
  const description = announcement.body.slice(0, 200);
  return [
    db.prepare(`
      INSERT OR IGNORE INTO notifications
        (id, institution_id, user_id, title, description, type, priority, route, source_type, source_id)
      SELECT lower(hex(randomblob(16))),
             institution_id,
             id,
             ?,
             ?,
             ?,
             ?,
             '/announcements',
             'ANNOUNCEMENT',
             ?
      FROM users
      WHERE institution_id = ?
        AND status = 'ACTIVE'
        ${audienceWhere(announcement.targetAudience)}
    `).bind(
      `📢 ${announcement.title}`,
      description,
      notificationType(announcement.type),
      announcement.priority,
      announcement.id,
      announcement.institutionId,
    ),
    db.prepare(`
      INSERT OR IGNORE INTO outbox_events
        (id, institution_id, event_type, aggregate_type, aggregate_id, dedupe_key, payload_json, status)
      VALUES (?, ?, 'announcement.published', 'Announcement', ?, ?, ?, 'PENDING')
    `).bind(
      crypto.randomUUID(),
      announcement.institutionId,
      announcement.id,
      `${announcement.id}:published:v1`,
      JSON.stringify({
        announcementId: announcement.id,
        title: announcement.title,
        type: announcement.type,
        priority: announcement.priority,
        targetAudience: announcement.targetAudience,
      }),
    ),
  ];
}

function mapAnnouncement(row: AnnouncementRow) {
  return { ...row, isPinned: row.isPinned === 1 };
}

export const communicationsRouter = new Hono<AppEnv>();

communicationsRouter.get("/announcements", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);

  const status = c.req.query("status")?.trim().toUpperCase();
  const validStatuses = new Set(["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"]);
  if (status && !validStatuses.has(status)) return c.json(fail("Invalid announcement status"), 400);

  const clauses = ["a.institution_id = ?"];
  const bindings: string[] = [user.institutionId];
  if (user.role === "USER") {
    clauses.push("a.status = 'PUBLISHED'");
    clauses.push("a.target_audience IN ('ALL', 'RESIDENTS')");
    clauses.push("(a.expires_at IS NULL OR a.expires_at > CURRENT_TIMESTAMP)");
  } else if (status) {
    clauses.push("a.status = ?");
    bindings.push(status);
  }

  const rows = await c.env.DB
    .prepare(`
      SELECT a.id,
             a.institution_id AS institutionId,
             a.title,
             a.body,
             a.type,
             a.priority,
             a.target_audience AS targetAudience,
             a.is_pinned AS isPinned,
             a.status,
             a.published_at AS publishedAt,
             a.scheduled_for AS scheduledFor,
             a.expires_at AS expiresAt,
             a.created_by AS createdBy,
             u.name AS creatorName,
             a.created_at AS createdAt,
             a.updated_at AS updatedAt
      FROM announcements a
      JOIN users u ON u.id = a.created_by
      WHERE ${clauses.join(" AND ")}
      ORDER BY a.is_pinned DESC,
               CASE a.status WHEN 'PUBLISHED' THEN 0 WHEN 'SCHEDULED' THEN 1 WHEN 'DRAFT' THEN 2 ELSE 3 END,
               COALESCE(a.published_at, a.created_at) DESC
      LIMIT 100
    `)
    .bind(...bindings)
    .all<AnnouncementRow>();

  return c.json(ok({ announcements: rows.results.map(mapAnnouncement) }));
});

const createAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(5).max(5000),
  type: z.enum(["INFO", "WARNING", "MAINTENANCE", "EVENT"]).default("INFO"),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  targetAudience: z.enum(["ALL", "RESIDENTS", "ADMINS"]).default("ALL"),
  isPinned: z.boolean().default(true),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED"]).default("PUBLISHED"),
  scheduledFor: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

communicationsRouter.post("/announcements", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);

  const parsed = createAnnouncementSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid announcement"), 400);

  let scheduledFor: string | null;
  let expiresAt: string | null;
  try {
    scheduledFor = parseIso(parsed.data.scheduledFor, "Scheduled time");
    expiresAt = parseIso(parsed.data.expiresAt, "Expiry");
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid date/time"), 400);
  }
  if (parsed.data.status === "SCHEDULED" && !scheduledFor) {
    return c.json(fail("Scheduled announcements require a publish time"), 400);
  }
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    return c.json(fail("Announcement expiry must be in the future"), 400);
  }

  const id = crypto.randomUUID();
  const publishedAt = parsed.data.status === "PUBLISHED" ? new Date().toISOString() : null;
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`
      INSERT INTO announcements
        (id, institution_id, title, body, type, priority, target_audience, is_pinned, status, published_at, scheduled_for, expires_at, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      admin.institutionId,
      parsed.data.title,
      parsed.data.body,
      parsed.data.type,
      parsed.data.priority,
      parsed.data.targetAudience,
      parsed.data.isPinned ? 1 : 0,
      parsed.data.status,
      publishedAt,
      scheduledFor,
      expiresAt,
      admin.id,
      admin.id,
    ),
  ];

  if (parsed.data.status === "PUBLISHED") {
    statements.push(...publishStatements(c.env.DB, {
      id,
      institutionId: admin.institutionId,
      title: parsed.data.title,
      body: parsed.data.body,
      type: parsed.data.type,
      priority: parsed.data.priority,
      targetAudience: parsed.data.targetAudience,
    }));
  }
  statements.push(auditStatement(
    c.env.DB,
    admin.id,
    "ANNOUNCEMENT_CREATE",
    "Announcement",
    id,
    JSON.stringify({ status: parsed.data.status, targetAudience: parsed.data.targetAudience, priority: parsed.data.priority }),
  ));

  await c.env.DB.batch(statements);
  return c.json(ok({ id, status: parsed.data.status }), 201);
});

const updateAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  body: z.string().trim().min(5).max(5000).optional(),
  type: z.enum(["INFO", "WARNING", "MAINTENANCE", "EVENT"]).optional(),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).optional(),
  targetAudience: z.enum(["ALL", "RESIDENTS", "ADMINS"]).optional(),
  isPinned: z.boolean().optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"]).optional(),
  scheduledFor: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "No announcement fields were provided" });

communicationsRouter.patch("/announcements/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = updateAnnouncementSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid announcement update"), 400);

  const existing = await c.env.DB
    .prepare(`
      SELECT a.id,
             a.institution_id AS institutionId,
             a.title,
             a.body,
             a.type,
             a.priority,
             a.target_audience AS targetAudience,
             a.is_pinned AS isPinned,
             a.status,
             a.published_at AS publishedAt,
             a.scheduled_for AS scheduledFor,
             a.expires_at AS expiresAt,
             a.created_by AS createdBy,
             u.name AS creatorName,
             a.created_at AS createdAt,
             a.updated_at AS updatedAt
      FROM announcements a
      JOIN users u ON u.id = a.created_by
      WHERE a.id = ? AND a.institution_id = ?
      LIMIT 1
    `)
    .bind(c.req.param("id"), admin.institutionId)
    .first<AnnouncementRow>();

  if (!existing) return c.json(fail("Announcement not found"), 404);
  if (existing.status === "ARCHIVED") return c.json(fail("Archived announcements are immutable"), 409);

  const contentMutation = parsed.data.title !== undefined
    || parsed.data.body !== undefined
    || parsed.data.type !== undefined
    || parsed.data.priority !== undefined
    || parsed.data.targetAudience !== undefined;
  if (existing.status === "PUBLISHED" && contentMutation) {
    return c.json(fail("Published announcements cannot be edited. Archive this one and create a corrected announcement."), 422);
  }
  if (existing.status === "PUBLISHED" && parsed.data.status && parsed.data.status !== "ARCHIVED" && parsed.data.status !== "PUBLISHED") {
    return c.json(fail("A published announcement cannot move back to draft or scheduled state"), 422);
  }

  const title = parsed.data.title ?? existing.title;
  const body = parsed.data.body ?? existing.body;
  const type = parsed.data.type ?? existing.type;
  const priority = parsed.data.priority ?? existing.priority;
  const targetAudience = parsed.data.targetAudience ?? existing.targetAudience;
  const status = parsed.data.status ?? existing.status;
  const isPinned = status === "ARCHIVED" ? false : parsed.data.isPinned ?? existing.isPinned === 1;

  let scheduledFor = existing.scheduledFor;
  let expiresAt = existing.expiresAt;
  try {
    if (parsed.data.scheduledFor !== undefined) scheduledFor = parseIso(parsed.data.scheduledFor, "Scheduled time");
    if (parsed.data.expiresAt !== undefined) expiresAt = parseIso(parsed.data.expiresAt, "Expiry");
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid date/time"), 400);
  }
  if (status === "SCHEDULED" && !scheduledFor) return c.json(fail("Scheduled announcements require a publish time"), 400);
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now() && status !== "ARCHIVED") {
    return c.json(fail("Announcement expiry must be in the future"), 400);
  }

  const firstPublish = existing.status !== "PUBLISHED" && status === "PUBLISHED";
  const publishedAt = firstPublish ? new Date().toISOString() : existing.publishedAt;

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`
      UPDATE announcements
      SET title = ?,
          body = ?,
          type = ?,
          priority = ?,
          target_audience = ?,
          is_pinned = ?,
          status = ?,
          published_at = ?,
          scheduled_for = ?,
          expires_at = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND institution_id = ?
    `).bind(
      title,
      body,
      type,
      priority,
      targetAudience,
      isPinned ? 1 : 0,
      status,
      publishedAt,
      scheduledFor,
      expiresAt,
      admin.id,
      existing.id,
      admin.institutionId,
    ),
  ];

  if (firstPublish) {
    statements.push(...publishStatements(c.env.DB, {
      id: existing.id,
      institutionId: admin.institutionId,
      title,
      body,
      type,
      priority,
      targetAudience,
    }));
  }
  statements.push(auditStatement(
    c.env.DB,
    admin.id,
    status === "ARCHIVED" ? "ANNOUNCEMENT_ARCHIVE" : firstPublish ? "ANNOUNCEMENT_PUBLISH" : "ANNOUNCEMENT_UPDATE",
    "Announcement",
    existing.id,
    JSON.stringify({ fromStatus: existing.status, toStatus: status, targetAudience, priority }),
  ));

  await c.env.DB.batch(statements);
  return c.json(ok({ id: existing.id, status, isPinned }));
});

communicationsRouter.delete("/announcements/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);

  const existing = await c.env.DB
    .prepare("SELECT id, status FROM announcements WHERE id = ? AND institution_id = ? LIMIT 1")
    .bind(c.req.param("id"), admin.institutionId)
    .first<{ id: string; status: AnnouncementStatus }>();
  if (!existing) return c.json(fail("Announcement not found"), 404);
  if (existing.status === "ARCHIVED") return c.json(ok({ archived: true, changed: false }));

  await c.env.DB.batch([
    c.env.DB
      .prepare("UPDATE announcements SET status = 'ARCHIVED', is_pinned = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND institution_id = ?")
      .bind(admin.id, existing.id, admin.institutionId),
    auditStatement(c.env.DB, admin.id, "ANNOUNCEMENT_ARCHIVE", "Announcement", existing.id, JSON.stringify({ fromStatus: existing.status })),
  ]);
  return c.json(ok({ archived: true, changed: true }));
});

communicationsRouter.get("/notifications", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  const unreadOnly = c.req.query("unread") === "true";
  const rows = await c.env.DB
    .prepare(`
      SELECT id,
             title,
             description,
             type,
             priority,
             route,
             source_type AS sourceType,
             source_id AS sourceId,
             read_at AS readAt,
             created_at AS createdAt
      FROM notifications
      WHERE user_id = ?
        ${unreadOnly ? "AND read_at IS NULL" : ""}
      ORDER BY CASE priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,
               created_at DESC
      LIMIT 100
    `)
    .bind(user.id)
    .all<NotificationRow>();
  const count = await c.env.DB
    .prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL")
    .bind(user.id)
    .first<{ count: number }>();
  return c.json(ok({ notifications: rows.results, unreadCount: count?.count ?? 0 }));
});

const notificationUpdateSchema = z.union([
  z.object({ markAllRead: z.literal(true) }),
  z.object({ id: z.string().min(1), read: z.boolean() }),
]);

communicationsRouter.patch("/notifications", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  const parsed = notificationUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail("Nothing to update"), 400);

  if ("markAllRead" in parsed.data) {
    await c.env.DB
      .prepare("UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE user_id = ?")
      .bind(user.id)
      .run();
    return c.json(ok({ updated: true }));
  }

  const notification = await c.env.DB
    .prepare("SELECT id FROM notifications WHERE id = ? AND user_id = ? LIMIT 1")
    .bind(parsed.data.id, user.id)
    .first<{ id: string }>();
  if (!notification) return c.json(fail("Notification not found"), 404);
  await c.env.DB
    .prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?")
    .bind(parsed.data.read ? new Date().toISOString() : null, parsed.data.id, user.id)
    .run();
  return c.json(ok({ updated: true, read: parsed.data.read }));
});

communicationsRouter.get("/communications/outbox", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const status = c.req.query("status")?.trim().toUpperCase() ?? "PENDING";
  if (!new Set(["PENDING", "DISPATCHED", "FAILED", "ALL"]).has(status)) return c.json(fail("Invalid outbox status"), 400);
  const rows = await c.env.DB
    .prepare(`
      SELECT id,
             event_type AS eventType,
             aggregate_type AS aggregateType,
             aggregate_id AS aggregateId,
             dedupe_key AS dedupeKey,
             status,
             attempts,
             available_at AS availableAt,
             dispatched_at AS dispatchedAt,
             last_error AS lastError,
             created_at AS createdAt
      FROM outbox_events
      WHERE institution_id = ?
        ${status === "ALL" ? "" : "AND status = ?"}
      ORDER BY created_at DESC
      LIMIT 100
    `)
    .bind(...(status === "ALL" ? [admin.institutionId] : [admin.institutionId, status]))
    .all();
  return c.json(ok({ events: rows.results }));
});
