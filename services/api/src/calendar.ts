import { Hono, type Context, type Next } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { addDays, parseDateKey, todayInZone } from "./domain/meal-engine";
import { validateCalendarRange, type CalendarEventType } from "./domain/calendar-rules";

type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  APP_ENV: string;
};

type AppEnv = { Bindings: Bindings };

type SessionUser = {
  id: string;
  institutionId: string;
  institutionTimeZone: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE";
};

type CalendarEventRow = {
  id: string;
  institutionId: string;
  name: string;
  description: string | null;
  type: CalendarEventType;
  startDate: string;
  endDate: string;
  mealsDisabled: number;
  status: "ACTIVE" | "ARCHIVED";
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type MealClosure = {
  id: string;
  name: string;
  type: CalendarEventType;
  startDate: string;
  endDate: string;
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
  const row = await c.env.DB
    .prepare(`
      SELECT u.id,
             u.institution_id AS institutionId,
             i.timezone AS institutionTimeZone,
             u.email,
             u.name,
             u.role,
             u.status
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN institutions i ON i.id = u.institution_id
      WHERE s.token_hash = ?
        AND s.expires_at > CURRENT_TIMESTAMP
        AND u.status = 'ACTIVE'
      LIMIT 1
    `)
    .bind(await sha256(token))
    .first<SessionUser>();
  return row ?? null;
}

function auditStatement(
  db: D1Database,
  actorUserId: string,
  action: string,
  entityId: string,
  detail: string,
): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail) VALUES (?, ?, ?, 'CalendarEvent', ?, ?)`)
    .bind(crypto.randomUUID(), actorUserId, action, entityId, detail);
}

function normalizeDate(value: string | undefined, fallback: string): string {
  const result = value?.trim() || fallback;
  parseDateKey(result);
  return result;
}

async function findMealClosure(db: D1Database, institutionId: string, serviceDate: string): Promise<MealClosure | null> {
  return await db
    .prepare(`
      SELECT id, name, type, start_date AS startDate, end_date AS endDate
      FROM calendar_events
      WHERE institution_id = ?
        AND status = 'ACTIVE'
        AND meals_disabled = 1
        AND ? BETWEEN start_date AND end_date
      ORDER BY start_date ASC
      LIMIT 1
    `)
    .bind(institutionId, serviceDate)
    .first<MealClosure>();
}

function closureMessage(event: MealClosure): string {
  const range = event.startDate === event.endDate ? event.startDate : `${event.startDate} to ${event.endDate}`;
  return `Meal service is disabled by calendar event “${event.name}” (${range}).`;
}

async function guestConflictCount(db: D1Database, institutionId: string, startDate: string, endDate: string): Promise<number> {
  const row = await db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM guest_meals
      WHERE institution_id = ?
        AND status = 'ACTIVE'
        AND service_date BETWEEN ? AND ?
    `)
    .bind(institutionId, startDate, endDate)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function disabledOverlap(
  db: D1Database,
  institutionId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
): Promise<{ id: string; name: string } | null> {
  const exclude = excludeId ? "AND id <> ?" : "";
  const bindings = excludeId
    ? [institutionId, startDate, endDate, excludeId]
    : [institutionId, startDate, endDate];
  return await db
    .prepare(`
      SELECT id, name
      FROM calendar_events
      WHERE institution_id = ?
        AND status = 'ACTIVE'
        AND meals_disabled = 1
        AND start_date <= ?
        AND end_date >= ?
        ${exclude}
      LIMIT 1
    `)
    .bind(...bindings)
    .first<{ id: string; name: string }>();
}

async function clonedJson(c: Context<AppEnv>): Promise<Record<string, unknown> | null> {
  try {
    const value = await c.req.raw.clone().json() as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function guardDateBody(c: Context<AppEnv>, next: Next, field = "serviceDate") {
  const user = await currentUser(c);
  if (!user) {
    await next();
    return;
  }
  const body = await clonedJson(c);
  const value = body?.[field];
  if (typeof value !== "string") {
    await next();
    return;
  }
  try {
    parseDateKey(value);
  } catch {
    await next();
    return;
  }
  const closure = await findMealClosure(c.env.DB, user.institutionId, value);
  if (closure) return c.json(fail(closureMessage(closure)), 422);
  await next();
}

export const calendarGuardRouter = new Hono<AppEnv>();

calendarGuardRouter.patch("/meals/toggle", async (c, next) => {
  const user = await currentUser(c);
  if (!user) {
    await next();
    return;
  }
  const body = await clonedJson(c);
  const entryId = body?.entryId;
  if (typeof entryId !== "string") {
    await next();
    return;
  }
  const entry = await c.env.DB
    .prepare(`
      SELECT e.service_date AS serviceDate
      FROM meal_entries e
      JOIN users u ON u.id = e.user_id
      WHERE e.id = ? AND u.institution_id = ?
      LIMIT 1
    `)
    .bind(entryId, user.institutionId)
    .first<{ serviceDate: string }>();
  if (!entry) {
    await next();
    return;
  }
  const closure = await findMealClosure(c.env.DB, user.institutionId, entry.serviceDate);
  if (closure) return c.json(fail(closureMessage(closure)), 422);
  await next();
});

calendarGuardRouter.post("/meals/presets/apply", async (c, next) => guardDateBody(c, next));
calendarGuardRouter.post("/meals/override", async (c, next) => guardDateBody(c, next));
calendarGuardRouter.post("/kitchen/guests", async (c, next) => guardDateBody(c, next));

export const calendarRouter = new Hono<AppEnv>();

const eventTypeSchema = z.enum(["HOLIDAY", "FESTIVAL", "SPECIAL_MEAL", "BILLING_DAY", "REFUND_DAY", "MAINTENANCE"]);

calendarRouter.get("/calendar/events", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  const today = todayInZone(user.institutionTimeZone);
  let from: string;
  let to: string;
  try {
    from = normalizeDate(c.req.query("from"), addDays(today, -30));
    to = normalizeDate(c.req.query("to"), addDays(today, 365));
    validateCalendarRange(from, to, 732);
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid calendar range"), 400);
  }

  const typeQuery = c.req.query("type")?.trim().toUpperCase();
  const parsedType = typeQuery ? eventTypeSchema.safeParse(typeQuery) : null;
  if (parsedType && !parsedType.success) return c.json(fail("Invalid calendar event type"), 400);
  const includeArchived = user.role === "ADMIN" && c.req.query("includeArchived") === "true";

  const clauses = [
    "institution_id = ?",
    "start_date <= ?",
    "end_date >= ?",
    includeArchived ? "status IN ('ACTIVE', 'ARCHIVED')" : "status = 'ACTIVE'",
  ];
  const bindings: string[] = [user.institutionId, to, from];
  if (parsedType?.success) {
    clauses.push("type = ?");
    bindings.push(parsedType.data);
  }

  const events = await c.env.DB
    .prepare(`
      SELECT id,
             institution_id AS institutionId,
             name,
             description,
             type,
             start_date AS startDate,
             end_date AS endDate,
             meals_disabled AS mealsDisabled,
             status,
             created_by AS createdBy,
             updated_by AS updatedBy,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM calendar_events
      WHERE ${clauses.join(" AND ")}
      ORDER BY start_date ASC, end_date ASC, name COLLATE NOCASE ASC
      LIMIT 500
    `)
    .bind(...bindings)
    .all<CalendarEventRow>();

  return c.json(ok({
    from,
    to,
    timeZone: user.institutionTimeZone,
    events: events.results.map((event) => ({ ...event, mealsDisabled: event.mealsDisabled === 1 })),
  }));
});

calendarRouter.get("/calendar/service-status", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  const today = todayInZone(user.institutionTimeZone);
  let date: string;
  try {
    date = normalizeDate(c.req.query("date"), today);
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid date"), 400);
  }
  const closure = await findMealClosure(c.env.DB, user.institutionId, date);
  return c.json(ok({ date, mealsDisabled: Boolean(closure), event: closure }));
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  type: eventTypeSchema.default("HOLIDAY"),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  mealsDisabled: z.boolean().default(true),
});

calendarRouter.post("/calendar/events", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid calendar event"), 400);

  let range;
  try {
    range = validateCalendarRange(parsed.data.startDate, parsed.data.endDate, 3660);
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid calendar range"), 400);
  }

  if (parsed.data.mealsDisabled) {
    const overlap = await disabledOverlap(c.env.DB, admin.institutionId, range.startDate, range.endDate);
    if (overlap) return c.json(fail(`Meal service is already disabled by “${overlap.name}” for part of this date range.`), 409);
    const guestConflicts = await guestConflictCount(c.env.DB, admin.institutionId, range.startDate, range.endDate);
    if (guestConflicts > 0) {
      return c.json(fail(`Cancel the ${guestConflicts} active guest meal entr${guestConflicts === 1 ? "y" : "ies"} in this range before disabling meal service.`), 409);
    }
  }

  const id = crypto.randomUUID();
  const detail = JSON.stringify({
    name: parsed.data.name,
    type: parsed.data.type,
    startDate: range.startDate,
    endDate: range.endDate,
    mealsDisabled: parsed.data.mealsDisabled,
  });
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO calendar_events
          (id, institution_id, name, description, type, start_date, end_date, meals_disabled, status, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      `).bind(
        id,
        admin.institutionId,
        parsed.data.name,
        parsed.data.description || null,
        parsed.data.type,
        range.startDate,
        range.endDate,
        parsed.data.mealsDisabled ? 1 : 0,
        admin.id,
        admin.id,
      ),
      auditStatement(c.env.DB, admin.id, "CALENDAR_EVENT_CREATE", id, detail),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("CALENDAR_MEAL_DISABLE_OVERLAP")) {
      return c.json(fail("This meal-disabling event overlaps another active meal-disabling event."), 409);
    }
    throw error;
  }
  return c.json(ok({ id }), 201);
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  type: eventTypeSchema.optional(),
  startDate: z.string().min(10).optional(),
  endDate: z.string().min(10).optional(),
  mealsDisabled: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "No calendar event fields were provided" });

calendarRouter.patch("/calendar/events/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid calendar update"), 400);

  const existing = await c.env.DB
    .prepare(`
      SELECT id,
             institution_id AS institutionId,
             name,
             description,
             type,
             start_date AS startDate,
             end_date AS endDate,
             meals_disabled AS mealsDisabled,
             status,
             created_by AS createdBy,
             updated_by AS updatedBy,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM calendar_events
      WHERE id = ? AND institution_id = ?
      LIMIT 1
    `)
    .bind(c.req.param("id"), admin.institutionId)
    .first<CalendarEventRow>();
  if (!existing) return c.json(fail("Calendar event not found"), 404);
  if (existing.status !== "ACTIVE") return c.json(fail("Archived calendar events are immutable"), 409);

  const targetStart = parsed.data.startDate ?? existing.startDate;
  const targetEnd = parsed.data.endDate ?? existing.endDate;
  const targetMealsDisabled = parsed.data.mealsDisabled ?? (existing.mealsDisabled === 1);
  let range;
  try {
    range = validateCalendarRange(targetStart, targetEnd, 3660);
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid calendar range"), 400);
  }

  const impactChanged = targetMealsDisabled !== (existing.mealsDisabled === 1)
    || (existing.mealsDisabled === 1 && (range.startDate !== existing.startDate || range.endDate !== existing.endDate));
  if (impactChanged) {
    return c.json(fail("Meal-impacting calendar rules are immutable. Archive this event and create a corrected event so meal history can be reversed safely."), 409);
  }

  const target = {
    name: parsed.data.name ?? existing.name,
    description: parsed.data.description === undefined ? existing.description : parsed.data.description,
    type: parsed.data.type ?? existing.type,
    startDate: range.startDate,
    endDate: range.endDate,
    mealsDisabled: targetMealsDisabled,
  };

  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE calendar_events
      SET name = ?,
          description = ?,
          type = ?,
          start_date = ?,
          end_date = ?,
          meals_disabled = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND institution_id = ? AND status = 'ACTIVE'
    `).bind(
      target.name,
      target.description,
      target.type,
      target.startDate,
      target.endDate,
      target.mealsDisabled ? 1 : 0,
      admin.id,
      existing.id,
      admin.institutionId,
    ),
    auditStatement(c.env.DB, admin.id, "CALENDAR_EVENT_UPDATE", existing.id, JSON.stringify({ before: existing, after: target })),
  ]);
  return c.json(ok({ id: existing.id, ...target }));
});

calendarRouter.delete("/calendar/events/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const existing = await c.env.DB
    .prepare(`
      SELECT id, name, type, start_date AS startDate, end_date AS endDate, meals_disabled AS mealsDisabled, status
      FROM calendar_events
      WHERE id = ? AND institution_id = ?
      LIMIT 1
    `)
    .bind(c.req.param("id"), admin.institutionId)
    .first<{ id: string; name: string; type: CalendarEventType; startDate: string; endDate: string; mealsDisabled: number; status: "ACTIVE" | "ARCHIVED" }>();
  if (!existing) return c.json(fail("Calendar event not found"), 404);
  if (existing.status === "ARCHIVED") return c.json(ok({ archived: true, changed: false }));

  await c.env.DB.batch([
    c.env.DB
      .prepare("UPDATE calendar_events SET status = 'ARCHIVED', updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND institution_id = ? AND status = 'ACTIVE'")
      .bind(admin.id, existing.id, admin.institutionId),
    auditStatement(c.env.DB, admin.id, "CALENDAR_EVENT_ARCHIVE", existing.id, JSON.stringify(existing)),
  ]);
  return c.json(ok({ archived: true, changed: true }));
});
