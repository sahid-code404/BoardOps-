import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import {
  allowedResidentActions,
  nextResidentStatus,
  residentActionRequiresReason,
  type ResidentLifecycleAction,
  type ResidentStatus,
} from "./domain/resident-lifecycle";

interface Bindings {
  DB: D1Database;
  FILES: R2Bucket;
  APP_ENV: string;
}

type AppEnv = { Bindings: Bindings };
type UserRole = "ADMIN" | "USER";
type UserStatus = ResidentStatus;

type SessionUser = {
  id: string;
  institutionId: string;
  institutionName: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  institutionUserId: string | null;
  phone: string | null;
  room: string | null;
  avatarUrl: string | null;
};

type ResidentRow = {
  id: string;
  email: string;
  name: string;
  status: ResidentStatus;
  institutionUserId: string | null;
  phone: string | null;
  room: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  avatarUrl: string | null;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RegistrationRequestRow = {
  id: string;
  cycle: number;
  reviewStatus: "PENDING_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED";
  requestedFieldsJson: string | null;
  reason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
};

const SESSION_COOKIE = "boardops_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export const app = new Hono<AppEnv>();

const ok = <T>(data: T) => ({ success: true as const, data });
const fail = (error: string) => ({ success: false as const, error });

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function findSessionUser(db: D1Database, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await db
    .prepare(`
      SELECT
        u.id,
        u.institution_id AS institutionId,
        i.name AS institutionName,
        u.email,
        u.name,
        u.role,
        u.status,
        u.institution_user_id AS institutionUserId,
        u.phone,
        u.room,
        u.avatar_url AS avatarUrl
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN institutions i ON i.id = u.institution_id
      WHERE s.token_hash = ?
        AND s.expires_at > CURRENT_TIMESTAMP
        AND u.status = 'ACTIVE'
      LIMIT 1
    `)
    .bind(tokenHash)
    .first<SessionUser>();
  if (!row) return null;
  await db
    .prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?")
    .bind(tokenHash)
    .run();
  return row;
}

async function currentUser(c: Context<AppEnv>): Promise<SessionUser | null> {
  return findSessionUser(c.env.DB, getCookie(c, SESSION_COOKIE));
}

function auditStatement(
  db: D1Database,
  actorUserId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  detail: string | null,
): D1PreparedStatement {
  return db
    .prepare(`
      INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(crypto.randomUUID(), actorUserId, action, entityType, entityId, detail);
}

async function audit(
  db: D1Database,
  actorUserId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  detail: string | null,
): Promise<void> {
  await auditStatement(db, actorUserId, action, entityType, entityId, detail).run();
}

async function getResidentById(
  db: D1Database,
  institutionId: string,
  residentId: string,
): Promise<ResidentRow | null> {
  return db
    .prepare(`
      SELECT
        id,
        email,
        name,
        status,
        institution_user_id AS institutionUserId,
        phone,
        room,
        gender,
        avatar_url AS avatarUrl,
        joined_at AS joinedAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM users
      WHERE id = ? AND institution_id = ? AND role = 'USER'
      LIMIT 1
    `)
    .bind(residentId, institutionId)
    .first<ResidentRow>();
}

app.get("/health", (c) => c.json({ status: "ok", service: "boardops-api" }));

app.get("/ready", async (c) => {
  try {
    const row = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    if (row?.ok !== 1) throw new Error("D1 readiness probe returned an unexpected result");
    return c.json({
      status: "ready",
      database: "d1",
      storage: "r2-bound",
      environment: c.env.APP_ENV,
    });
  } catch {
    return c.json({ status: "not_ready" }, 503);
  }
});

const api = new Hono<AppEnv>();

api.get("/", (c) => c.json(ok({ name: "BoardOps API", version: "v1", status: "phase-02-identity" })));

api.post("/auth/login", async (c) => {
  if (c.env.APP_ENV !== "local") {
    return c.json(fail("Development login is disabled outside the local environment"), 404);
  }

  let body: { email?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail("Invalid JSON body"), 400);
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !body.password) return c.json(fail("Email and password are required"), 400);
  if (body.password !== "boardops-demo") return c.json(fail("Invalid email or password"), 401);

  const user = await c.env.DB
    .prepare(`
      SELECT
        u.id,
        u.institution_id AS institutionId,
        i.name AS institutionName,
        u.email,
        u.name,
        u.role,
        u.status,
        u.institution_user_id AS institutionUserId,
        u.phone,
        u.room,
        u.avatar_url AS avatarUrl
      FROM users u
      JOIN institutions i ON i.id = u.institution_id
      WHERE lower(u.email) = ? AND u.status = 'ACTIVE'
      LIMIT 1
    `)
    .bind(email)
    .first<SessionUser>();

  if (!user) return c.json(fail("Invalid email or password"), 401);

  await c.env.DB.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();
  const rawToken = randomToken();
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await c.env.DB
    .prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt)
    .run();

  setCookie(c, SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  await audit(c.env.DB, user.id, "LOGIN", "Session", null, "Local development login");
  return c.json(ok({ user }));
});

api.get("/auth/me", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  return c.json(ok({ user }));
});

api.post("/auth/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = await findSessionUser(c.env.DB, token);
  if (token) {
    const tokenHash = await sha256(token);
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  if (user) await audit(c.env.DB, user.id, "LOGOUT", "Session", null, "User signed out");
  return c.json(ok({ loggedOut: true }));
});

api.get("/dashboard", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);

  const institution = await c.env.DB
    .prepare("SELECT id, name, currency, timezone FROM institutions WHERE id = ?")
    .bind(user.institutionId)
    .first<{ id: string; name: string; currency: string; timezone: string }>();

  if (user.role === "ADMIN") {
    const counts = await c.env.DB
      .prepare(`
        SELECT
          SUM(CASE WHEN role = 'USER' AND status = 'ACTIVE' THEN 1 ELSE 0 END) AS activeResidents,
          SUM(CASE WHEN role = 'USER' AND status = 'PENDING' THEN 1 ELSE 0 END) AS pendingResidents,
          SUM(CASE WHEN role = 'USER' AND status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspendedResidents,
          COUNT(DISTINCT CASE WHEN role = 'USER' AND status = 'ACTIVE' THEN room END) AS occupiedRooms
        FROM users
        WHERE institution_id = ?
      `)
      .bind(user.institutionId)
      .first<{
        activeResidents: number | null;
        pendingResidents: number | null;
        suspendedResidents: number | null;
        occupiedRooms: number | null;
      }>();

    const activity = await c.env.DB
      .prepare(`
        SELECT a.id, a.action, a.entity_type AS entityType, a.detail, a.created_at AS createdAt,
               COALESCE(u.name, 'System') AS actorName
        FROM audit_events a
        LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.created_at DESC
        LIMIT 8
      `)
      .all<{ id: string; action: string; entityType: string; detail: string | null; createdAt: string; actorName: string }>();

    return c.json(ok({
      institution,
      viewer: user,
      isAdmin: true,
      kpis: {
        activeResidents: counts?.activeResidents ?? 0,
        pendingResidents: counts?.pendingResidents ?? 0,
        suspendedResidents: counts?.suspendedResidents ?? 0,
        occupiedRooms: counts?.occupiedRooms ?? 0,
      },
      recentActivity: activity.results,
      modules: {
        residents: "active",
        registrationReview: "active",
        meals: "planned",
        billing: "planned",
        payments: "planned",
      },
    }));
  }

  return c.json(ok({
    institution,
    viewer: user,
    isAdmin: false,
    kpis: {
      profileStatus: user.status,
      room: user.room,
    },
    recentActivity: [],
    modules: {
      profile: "active",
      meals: "planned",
      billing: "planned",
      payments: "planned",
    },
  }));
});

api.get("/residents", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  if (user.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);

  const q = c.req.query("q")?.trim().toLowerCase() ?? "";
  const status = c.req.query("status")?.trim().toUpperCase() ?? "ALL";
  const validStatuses = new Set(["ALL", "ACTIVE", "PENDING", "SUSPENDED", "ARCHIVED"]);
  if (!validStatuses.has(status)) return c.json(fail("Invalid resident status filter"), 400);

  const clauses = ["u.institution_id = ?", "u.role = 'USER'"];
  const bindings: string[] = [user.institutionId];
  if (status !== "ALL") {
    clauses.push("u.status = ?");
    bindings.push(status);
  }
  if (q) {
    clauses.push("(lower(u.name) LIKE ? OR lower(u.email) LIKE ? OR lower(COALESCE(u.room, '')) LIKE ? OR lower(COALESCE(u.institution_user_id, '')) LIKE ?)");
    const pattern = `%${q}%`;
    bindings.push(pattern, pattern, pattern, pattern);
  }

  const statement = c.env.DB.prepare(`
    SELECT
      u.id,
      u.email,
      u.name,
      u.status,
      u.institution_user_id AS institutionUserId,
      u.phone,
      u.room,
      u.gender,
      u.avatar_url AS avatarUrl,
      u.joined_at AS joinedAt,
      u.created_at AS createdAt,
      u.updated_at AS updatedAt,
      (
        SELECT rr.review_status
        FROM registration_requests rr
        WHERE rr.user_id = u.id
        ORDER BY rr.cycle DESC
        LIMIT 1
      ) AS reviewStatus
    FROM users u
    WHERE ${clauses.join(" AND ")}
    ORDER BY
      CASE u.status WHEN 'PENDING' THEN 0 WHEN 'ACTIVE' THEN 1 WHEN 'SUSPENDED' THEN 2 ELSE 3 END,
      u.name COLLATE NOCASE ASC
    LIMIT 200
  `);
  const result = await statement.bind(...bindings).all();
  return c.json(ok({ residents: result.results }));
});

api.get("/residents/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);

  const resident = await getResidentById(c.env.DB, admin.institutionId, c.req.param("id"));
  if (!resident) return c.json(fail("Resident not found"), 404);

  const registration = await c.env.DB
    .prepare(`
      SELECT
        rr.id,
        rr.cycle,
        rr.review_status AS reviewStatus,
        rr.requested_fields_json AS requestedFieldsJson,
        rr.reason,
        rr.submitted_at AS submittedAt,
        rr.reviewed_at AS reviewedAt,
        reviewer.name AS reviewedByName
      FROM registration_requests rr
      LEFT JOIN users reviewer ON reviewer.id = rr.reviewed_by
      WHERE rr.user_id = ?
      ORDER BY rr.cycle DESC
      LIMIT 1
    `)
    .bind(resident.id)
    .first<RegistrationRequestRow>();

  const events = await c.env.DB
    .prepare(`
      SELECT
        e.id,
        e.from_status AS fromStatus,
        e.to_status AS toStatus,
        e.action,
        e.reason,
        e.created_at AS createdAt,
        COALESCE(actor.name, 'System') AS actorName
      FROM resident_status_events e
      LEFT JOIN users actor ON actor.id = e.actor_user_id
      WHERE e.user_id = ?
      ORDER BY e.created_at DESC
      LIMIT 20
    `)
    .bind(resident.id)
    .all();

  return c.json(ok({
    resident,
    registration: registration
      ? {
          ...registration,
          requestedFields: registration.requestedFieldsJson
            ? (JSON.parse(registration.requestedFieldsJson) as string[])
            : [],
        }
      : null,
    events: events.results,
    allowedActions: allowedResidentActions(resident.status),
  }));
});

const residentActionSchema = z.object({
  action: z.enum(["APPROVE", "REQUEST_CHANGES", "REJECT", "SUSPEND", "ACTIVATE", "ARCHIVE", "RESTORE"]),
  reason: z.string().trim().max(500).optional(),
  fields: z.array(z.enum(["name", "email", "phone", "room", "gender"])).max(5).optional(),
});

api.post("/residents/:id/action", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail("Invalid JSON body"), 400);
  }
  const parsed = residentActionSchema.safeParse(body);
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid resident action"), 400);

  const resident = await getResidentById(c.env.DB, admin.institutionId, c.req.param("id"));
  if (!resident) return c.json(fail("Resident not found"), 404);

  const action = parsed.data.action as ResidentLifecycleAction;
  const reason = parsed.data.reason?.trim() || null;
  if (residentActionRequiresReason(action) && (!reason || reason.length < 3)) {
    return c.json(fail("A reason of at least 3 characters is required for this action"), 400);
  }
  if (action === "REQUEST_CHANGES" && (!parsed.data.fields || parsed.data.fields.length === 0)) {
    return c.json(fail("Choose at least one field that needs changes"), 400);
  }

  let nextStatus: ResidentStatus;
  try {
    nextStatus = nextResidentStatus(resident.status, action);
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid resident state transition"), 422);
  }

  let registration: RegistrationRequestRow | null = null;
  if (action === "APPROVE" || action === "REQUEST_CHANGES" || action === "REJECT") {
    registration = await c.env.DB
      .prepare(`
        SELECT
          rr.id,
          rr.cycle,
          rr.review_status AS reviewStatus,
          rr.requested_fields_json AS requestedFieldsJson,
          rr.reason,
          rr.submitted_at AS submittedAt,
          rr.reviewed_at AS reviewedAt,
          reviewer.name AS reviewedByName
        FROM registration_requests rr
        LEFT JOIN users reviewer ON reviewer.id = rr.reviewed_by
        WHERE rr.user_id = ?
        ORDER BY rr.cycle DESC
        LIMIT 1
      `)
      .bind(resident.id)
      .first<RegistrationRequestRow>();
    if (!registration) {
      return c.json(fail("This pending resident has no registration request to review"), 409);
    }
    if (!["PENDING_REVIEW", "CHANGES_REQUESTED"].includes(registration.reviewStatus)) {
      return c.json(fail(`Registration review is already ${registration.reviewStatus.toLowerCase().replaceAll("_", " ")}`), 409);
    }
  }

  const detail = JSON.stringify({
    residentName: resident.name,
    fromStatus: resident.status,
    toStatus: nextStatus,
    action,
    reason,
    requestedFields: parsed.data.fields ?? [],
  });

  const statements: D1PreparedStatement[] = [
    c.env.DB
      .prepare(`
        UPDATE users
        SET status = ?,
            joined_at = CASE
              WHEN ? = 'APPROVE' THEN COALESCE(joined_at, CURRENT_TIMESTAMP)
              ELSE joined_at
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND institution_id = ? AND role = 'USER'
      `)
      .bind(nextStatus, action, resident.id, admin.institutionId),
    c.env.DB
      .prepare(`
        INSERT INTO resident_status_events
          (id, user_id, actor_user_id, from_status, to_status, action, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        crypto.randomUUID(),
        resident.id,
        admin.id,
        resident.status,
        nextStatus,
        action,
        reason,
      ),
    auditStatement(c.env.DB, admin.id, `RESIDENT_${action}`, "User", resident.id, detail),
  ];

  if (registration) {
    const reviewStatus = action === "APPROVE"
      ? "APPROVED"
      : action === "REJECT"
        ? "REJECTED"
        : "CHANGES_REQUESTED";
    statements.push(
      c.env.DB
        .prepare(`
          UPDATE registration_requests
          SET review_status = ?,
              requested_fields_json = ?,
              reason = ?,
              reviewed_by = ?,
              reviewed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .bind(
          reviewStatus,
          action === "REQUEST_CHANGES" ? JSON.stringify(parsed.data.fields ?? []) : null,
          reason,
          admin.id,
          registration.id,
        ),
    );
  }

  if (["SUSPEND", "ARCHIVE", "REJECT"].includes(action)) {
    statements.push(c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(resident.id));
  }

  await c.env.DB.batch(statements);
  const updated = await getResidentById(c.env.DB, admin.institutionId, resident.id);
  return c.json(ok({ resident: updated, action }));
});

const residentEditSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(200).optional(),
    phone: z.string().trim().min(8).max(30).nullable().optional(),
    room: z.string().trim().max(20).nullable().optional(),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No resident fields were provided" });

api.put("/residents/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail("Invalid JSON body"), 400);
  }
  const parsed = residentEditSchema.safeParse(body);
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid resident details"), 400);

  const resident = await getResidentById(c.env.DB, admin.institutionId, c.req.param("id"));
  if (!resident) return c.json(fail("Resident not found"), 404);

  const updates: string[] = [];
  const values: (string | null)[] = [];
  const changedFields: string[] = [];

  if (parsed.data.name !== undefined && parsed.data.name !== resident.name) {
    updates.push("name = ?");
    values.push(parsed.data.name);
    changedFields.push("name");
  }
  if (parsed.data.email !== undefined) {
    const email = parsed.data.email.toLowerCase();
    if (email !== resident.email.toLowerCase()) {
      const existing = await c.env.DB
        .prepare("SELECT id FROM users WHERE lower(email) = ? AND id <> ? LIMIT 1")
        .bind(email, resident.id)
        .first<{ id: string }>();
      if (existing) return c.json(fail("That email address is already in use"), 409);
      updates.push("email = ?");
      values.push(email);
      changedFields.push("email");
    }
  }
  if (parsed.data.phone !== undefined && parsed.data.phone !== resident.phone) {
    updates.push("phone = ?");
    values.push(parsed.data.phone || null);
    changedFields.push("phone");
  }
  if (parsed.data.room !== undefined && parsed.data.room !== resident.room) {
    updates.push("room = ?");
    values.push(parsed.data.room || null);
    changedFields.push("room");
  }
  if (parsed.data.gender !== undefined && parsed.data.gender !== resident.gender) {
    updates.push("gender = ?");
    values.push(parsed.data.gender);
    changedFields.push("gender");
  }

  if (updates.length === 0) return c.json(ok({ resident, changedFields: [] }));

  updates.push("updated_at = CURRENT_TIMESTAMP");
  const updateStatement = c.env.DB
    .prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ? AND institution_id = ? AND role = 'USER'`)
    .bind(...values, resident.id, admin.institutionId);
  const detail = JSON.stringify({ residentName: resident.name, changedFields });

  await c.env.DB.batch([
    updateStatement,
    auditStatement(c.env.DB, admin.id, "RESIDENT_PROFILE_EDIT", "User", resident.id, detail),
  ]);

  const updated = await getResidentById(c.env.DB, admin.institutionId, resident.id);
  return c.json(ok({ resident: updated, changedFields }));
});

app.route("/api/v1", api);

export default app;
