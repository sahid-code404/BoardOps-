import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

interface Bindings {
  DB: D1Database;
  FILES: R2Bucket;
  APP_ENV: string;
}

type AppEnv = { Bindings: Bindings };
type UserRole = "ADMIN" | "USER";
type UserStatus = "ACTIVE" | "PENDING" | "SUSPENDED" | "ARCHIVED";

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

async function currentUser(c: Parameters<typeof app.get>[1] extends never ? never : any): Promise<SessionUser | null> {
  return findSessionUser(c.env.DB, getCookie(c, SESSION_COOKIE));
}

async function audit(
  db: D1Database,
  actorUserId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  detail: string | null,
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(crypto.randomUUID(), actorUserId, action, entityType, entityId, detail)
    .run();
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

api.get("/", (c) => c.json(ok({ name: "BoardOps API", version: "v1", status: "phase-02" })));

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
        LIMIT 6
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

  const clauses = ["institution_id = ?", "role = 'USER'"];
  const bindings: string[] = [user.institutionId];
  if (status !== "ALL") {
    clauses.push("status = ?");
    bindings.push(status);
  }
  if (q) {
    clauses.push("(lower(name) LIKE ? OR lower(email) LIKE ? OR lower(COALESCE(room, '')) LIKE ? OR lower(COALESCE(institution_user_id, '')) LIKE ?)");
    const pattern = `%${q}%`;
    bindings.push(pattern, pattern, pattern, pattern);
  }

  const statement = c.env.DB.prepare(`
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
      created_at AS createdAt
    FROM users
    WHERE ${clauses.join(" AND ")}
    ORDER BY
      CASE status WHEN 'PENDING' THEN 0 WHEN 'ACTIVE' THEN 1 WHEN 'SUSPENDED' THEN 2 ELSE 3 END,
      name COLLATE NOCASE ASC
    LIMIT 200
  `);
  const result = await statement.bind(...bindings).all();
  return c.json(ok({ residents: result.results }));
});

app.route("/api/v1", api);

export default app;
