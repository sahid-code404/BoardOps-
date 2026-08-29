import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import {
  computeEditableUntil,
  isMealEntryLocked,
  isOverridden,
  parseDateKey,
  todayInZone,
  type CutoffStrategy,
  type MealEntryStatus,
  type MealState,
} from "./domain/meal-engine";

type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  APP_ENV: string;
};

type AppEnv = { Bindings: Bindings };
type SessionUser = {
  id: string;
  institutionId: string;
  institutionName: string;
  institutionTimeZone: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE";
  joinedAt: string | null;
};

type MealConfigRow = {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  icon: string;
  color: string;
  mealType: string;
  displayOrder: number;
  defaultState: MealState;
  defaultVisibility: "VISIBLE" | "HIDDEN";
  cutoffStrategy: CutoffStrategy;
  cutoffTime: string;
  cutoffOffsetMinutes: number;
  startTime: string;
  endTime: string;
  status: "ACTIVE" | "ARCHIVED";
  notes: string | null;
};

type MealEntryRow = {
  id: string;
  mealId: string;
  serviceDate: string;
  status: MealEntryStatus;
  originalState: MealState;
  editableUntil: string;
  locked: number;
  updatedBy: string | null;
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
             i.name AS institutionName,
             i.timezone AS institutionTimeZone,
             u.email,
             u.name,
             u.role,
             u.status,
             u.joined_at AS joinedAt
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
  entityType: string,
  entityId: string,
  detail: string,
) {
  return db
    .prepare(`INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), actorUserId, action, entityType, entityId, detail);
}

function normalizeDate(value: string | undefined, timeZone: string): string {
  const date = value?.trim() || todayInZone(timeZone);
  parseDateKey(date);
  return date;
}

async function mealConfigurations(db: D1Database, institutionId: string, includeArchived = false): Promise<MealConfigRow[]> {
  const result = await db
    .prepare(`
      SELECT id,
             name,
             display_name AS displayName,
             description,
             icon,
             color,
             meal_type AS mealType,
             display_order AS displayOrder,
             default_state AS defaultState,
             default_visibility AS defaultVisibility,
             cutoff_strategy AS cutoffStrategy,
             cutoff_time AS cutoffTime,
             cutoff_offset_minutes AS cutoffOffsetMinutes,
             start_time AS startTime,
             end_time AS endTime,
             status,
             notes
      FROM meal_configurations
      WHERE institution_id = ? ${includeArchived ? "" : "AND status = 'ACTIVE'"}
      ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, display_order ASC, created_at ASC
    `)
    .bind(institutionId)
    .all<MealConfigRow>();
  return result.results;
}

async function ensureEntries(
  db: D1Database,
  user: SessionUser,
  serviceDate: string,
): Promise<Array<MealEntryRow & { meal: MealConfigRow }>> {
  const configs = await mealConfigurations(db, user.institutionId, false);
  const joinedDate = user.joinedAt?.slice(0, 10) ?? null;
  const statements: D1PreparedStatement[] = [];
  const now = new Date();

  for (const meal of configs) {
    if (joinedDate && serviceDate < joinedDate) continue;
    const editableUntil = computeEditableUntil(meal, serviceDate, user.institutionTimeZone);
    const isLocked = editableUntil.getTime() <= now.getTime();
    const status: MealEntryStatus = isLocked && meal.defaultState === "ON" ? "LOCKED" : meal.defaultState;
    statements.push(
      db.prepare(`
        INSERT OR IGNORE INTO meal_entries
          (id, user_id, meal_id, service_date, status, original_state, editable_until, locked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        user.id,
        meal.id,
        serviceDate,
        status,
        meal.defaultState,
        editableUntil.toISOString(),
        isLocked ? 1 : 0,
      ),
    );
  }
  if (statements.length > 0) await db.batch(statements);

  await db
    .prepare(`
      UPDATE meal_entries
      SET locked = 1,
          status = CASE WHEN status = 'ON' THEN 'LOCKED' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND service_date = ? AND locked = 0 AND editable_until <= ?
    `)
    .bind(user.id, serviceDate, now.toISOString())
    .run();

  const result = await db
    .prepare(`
      SELECT e.id,
             e.meal_id AS mealId,
             e.service_date AS serviceDate,
             e.status,
             e.original_state AS originalState,
             e.editable_until AS editableUntil,
             e.locked,
             e.updated_by AS updatedBy,
             m.id AS m_id,
             m.name AS m_name,
             m.display_name AS m_displayName,
             m.description AS m_description,
             m.icon AS m_icon,
             m.color AS m_color,
             m.meal_type AS m_mealType,
             m.display_order AS m_displayOrder,
             m.default_state AS m_defaultState,
             m.default_visibility AS m_defaultVisibility,
             m.cutoff_strategy AS m_cutoffStrategy,
             m.cutoff_time AS m_cutoffTime,
             m.cutoff_offset_minutes AS m_cutoffOffsetMinutes,
             m.start_time AS m_startTime,
             m.end_time AS m_endTime,
             m.status AS m_status,
             m.notes AS m_notes
      FROM meal_entries e
      JOIN meal_configurations m ON m.id = e.meal_id
      WHERE e.user_id = ? AND e.service_date = ? AND m.status = 'ACTIVE'
      ORDER BY m.display_order ASC, m.created_at ASC
    `)
    .bind(user.id, serviceDate)
    .all<Record<string, unknown>>();

  return result.results.map((row) => ({
    id: String(row.id),
    mealId: String(row.mealId),
    serviceDate: String(row.serviceDate),
    status: row.status as MealEntryStatus,
    originalState: row.originalState as MealState,
    editableUntil: String(row.editableUntil),
    locked: Number(row.locked),
    updatedBy: row.updatedBy ? String(row.updatedBy) : null,
    meal: {
      id: String(row.m_id),
      name: String(row.m_name),
      displayName: String(row.m_displayName),
      description: row.m_description ? String(row.m_description) : null,
      icon: String(row.m_icon),
      color: String(row.m_color),
      mealType: String(row.m_mealType),
      displayOrder: Number(row.m_displayOrder),
      defaultState: row.m_defaultState as MealState,
      defaultVisibility: row.m_defaultVisibility as "VISIBLE" | "HIDDEN",
      cutoffStrategy: row.m_cutoffStrategy as CutoffStrategy,
      cutoffTime: String(row.m_cutoffTime),
      cutoffOffsetMinutes: Number(row.m_cutoffOffsetMinutes),
      startTime: String(row.m_startTime),
      endTime: String(row.m_endTime),
      status: row.m_status as "ACTIVE" | "ARCHIVED",
      notes: row.m_notes ? String(row.m_notes) : null,
    },
  }));
}

export const operationsRouter = new Hono<AppEnv>();

operationsRouter.get("/meals/config", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  return c.json(ok({ meals: await mealConfigurations(c.env.DB, user.institutionId, user.role === "ADMIN") }));
});

const configSchema = z.object({
  name: z.string().trim().min(2).max(60),
  displayName: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional(),
  icon: z.string().trim().min(1).max(8).default("🍽️"),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default("#8b5cf6"),
  mealType: z.string().trim().min(2).max(30).default("REGULAR"),
  displayOrder: z.number().int().min(0).max(100).default(0),
  defaultState: z.enum(["ON", "OFF"]).default("ON"),
  cutoffStrategy: z.enum(["PREVIOUS_DAY", "SAME_DAY", "CUSTOM_OFFSET"]).default("SAME_DAY"),
  cutoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("16:00"),
  cutoffOffsetMinutes: z.number().int().min(0).max(10080).default(0),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("08:00"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("10:00"),
});

operationsRouter.post("/meals/config", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  if (user.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = configSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid meal configuration"), 400);
  const existing = await c.env.DB
    .prepare("SELECT id FROM meal_configurations WHERE institution_id = ? AND lower(name) = lower(?) LIMIT 1")
    .bind(user.institutionId, parsed.data.name)
    .first<{ id: string }>();
  if (existing) return c.json(fail("A meal with this name already exists"), 409);
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO meal_configurations
        (id, institution_id, name, display_name, description, icon, color, meal_type, display_order,
         default_state, cutoff_strategy, cutoff_time, cutoff_offset_minutes, start_time, end_time, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).bind(
      id,
      user.institutionId,
      parsed.data.name,
      parsed.data.displayName,
      parsed.data.description ?? null,
      parsed.data.icon,
      parsed.data.color,
      parsed.data.mealType,
      parsed.data.displayOrder,
      parsed.data.defaultState,
      parsed.data.cutoffStrategy,
      parsed.data.cutoffTime,
      parsed.data.cutoffOffsetMinutes,
      parsed.data.startTime,
      parsed.data.endTime,
    ),
    auditStatement(c.env.DB, user.id, "MEAL_CONFIG_CREATE", "MealConfiguration", id, JSON.stringify({ name: parsed.data.name })),
  ]);
  return c.json(ok({ id }), 201);
});

operationsRouter.get("/meals/entries", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  if (user.role !== "USER") return c.json(fail("Resident account required"), 403);
  let date: string;
  try {
    date = normalizeDate(c.req.query("date"), user.institutionTimeZone);
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid date"), 400);
  }
  const entries = await ensureEntries(c.env.DB, user, date);
  return c.json(ok({
    date,
    timeZone: user.institutionTimeZone,
    meals: entries.map((entry) => ({
      id: entry.id,
      mealId: entry.mealId,
      serviceDate: entry.serviceDate,
      status: entry.status,
      originalState: entry.originalState,
      locked: isMealEntryLocked({ locked: entry.locked === 1, status: entry.status, editableUntil: entry.editableUntil }),
      overridden: isOverridden(entry),
      editableUntil: entry.editableUntil,
      displayName: entry.meal.displayName,
      name: entry.meal.name,
      icon: entry.meal.icon,
      color: entry.meal.color,
      startTime: entry.meal.startTime,
      endTime: entry.meal.endTime,
      cutoffStrategy: entry.meal.cutoffStrategy,
      cutoffTime: entry.meal.cutoffTime,
    })),
  }));
});

const toggleSchema = z.object({
  entryId: z.string().uuid(),
  status: z.enum(["ON", "OFF"]),
});

operationsRouter.patch("/meals/toggle", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  if (user.role !== "USER") return c.json(fail("Resident account required"), 403);
  const parsed = toggleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid meal change"), 400);

  const entry = await c.env.DB
    .prepare(`
      SELECT e.id,
             e.meal_id AS mealId,
             e.status,
             e.original_state AS originalState,
             e.editable_until AS editableUntil,
             e.locked,
             e.service_date AS serviceDate,
             m.display_name AS mealName
      FROM meal_entries e
      JOIN meal_configurations m ON m.id = e.meal_id
      WHERE e.id = ? AND e.user_id = ? AND m.institution_id = ?
      LIMIT 1
    `)
    .bind(parsed.data.entryId, user.id, user.institutionId)
    .first<{ id: string; mealId: string; status: MealEntryStatus; originalState: MealState; editableUntil: string; locked: number; serviceDate: string; mealName: string }>();
  if (!entry) return c.json(fail("Meal entry not found"), 404);

  if (isMealEntryLocked({ locked: entry.locked === 1, status: entry.status, editableUntil: entry.editableUntil })) {
    if (!entry.locked || (entry.status === "ON")) {
      await c.env.DB
        .prepare("UPDATE meal_entries SET locked = 1, status = CASE WHEN status = 'ON' THEN 'LOCKED' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(entry.id)
        .run();
    }
    return c.json(fail("This meal's cutoff has passed and the choice is locked"), 422);
  }

  if (entry.status === parsed.data.status) return c.json(ok({ changed: false }));
  const detail = JSON.stringify({ mealName: entry.mealName, serviceDate: entry.serviceDate, from: entry.status, to: parsed.data.status });
  await c.env.DB.batch([
    c.env.DB
      .prepare("UPDATE meal_entries SET status = ?, original_state = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(parsed.data.status, parsed.data.status, user.id, entry.id),
    c.env.DB
      .prepare(`INSERT INTO meal_history (id, meal_entry_id, meal_id, user_id, old_status, new_status, changed_by, trigger_source) VALUES (?, ?, ?, ?, ?, ?, ?, 'MANUAL')`)
      .bind(crypto.randomUUID(), entry.id, entry.mealId, user.id, entry.status, parsed.data.status, user.id),
    auditStatement(c.env.DB, user.id, "MEAL_TOGGLE", "MealEntry", entry.id, detail),
  ]);
  return c.json(ok({ changed: true, status: parsed.data.status }));
});

operationsRouter.get("/kitchen", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  let date: string;
  try {
    date = normalizeDate(c.req.query("date"), admin.institutionTimeZone);
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid date"), 400);
  }

  const residents = await c.env.DB
    .prepare(`
      SELECT u.id,
             u.institution_id AS institutionId,
             i.name AS institutionName,
             i.timezone AS institutionTimeZone,
             u.email,
             u.name,
             u.role,
             u.status,
             u.joined_at AS joinedAt,
             u.room
      FROM users u
      JOIN institutions i ON i.id = u.institution_id
      WHERE u.institution_id = ? AND u.role = 'USER' AND u.status = 'ACTIVE'
      ORDER BY u.name COLLATE NOCASE ASC
    `)
    .bind(admin.institutionId)
    .all<SessionUser & { room: string | null }>();

  for (const resident of residents.results) {
    await ensureEntries(c.env.DB, resident, date);
  }

  const configs = await mealConfigurations(c.env.DB, admin.institutionId, false);
  const rows = await c.env.DB
    .prepare(`
      SELECT e.id,
             e.user_id AS userId,
             e.meal_id AS mealId,
             e.status,
             e.original_state AS originalState,
             e.editable_until AS editableUntil,
             e.locked,
             u.name AS residentName,
             u.room
      FROM meal_entries e
      JOIN users u ON u.id = e.user_id
      JOIN meal_configurations m ON m.id = e.meal_id
      WHERE e.service_date = ?
        AND u.institution_id = ?
        AND u.role = 'USER'
        AND u.status = 'ACTIVE'
        AND m.status = 'ACTIVE'
    `)
    .bind(date, admin.institutionId)
    .all<{ id: string; userId: string; mealId: string; status: MealEntryStatus; originalState: MealState; editableUntil: string; locked: number; residentName: string; room: string | null }>();

  const today = todayInZone(admin.institutionTimeZone);
  const pastDate = date < today;
  const confirmed = (row: typeof rows.results[number]) => pastDate || isMealEntryLocked({ locked: row.locked === 1, status: row.status, editableUntil: row.editableUntil }) || isOverridden(row);
  const counts = configs.map((meal) => {
    const mealRows = rows.results.filter((row) => row.mealId === meal.id);
    const on = mealRows.filter((row) => (row.status === "ON" || row.status === "LOCKED") && confirmed(row)).length;
    const off = mealRows.filter((row) => row.status === "OFF" && confirmed(row) && !isOverridden(row)).length;
    return {
      id: meal.id,
      name: meal.name,
      displayName: meal.displayName,
      icon: meal.icon,
      color: meal.color,
      startTime: meal.startTime,
      endTime: meal.endTime,
      on,
      off,
      open: Math.max(0, residents.results.length - on - off),
      total: on,
    };
  });

  const userMealStatus = residents.results.map((resident) => ({
    userId: resident.id,
    name: resident.name,
    room: resident.room,
    meals: configs.map((meal) => {
      const row = rows.results.find((entry) => entry.userId === resident.id && entry.mealId === meal.id);
      if (!row) return { mealId: meal.id, mealName: meal.displayName, status: "OFF" as MealEntryStatus, locked: true, confirmed: true };
      return {
        mealId: meal.id,
        mealName: meal.displayName,
        status: row.status,
        locked: isMealEntryLocked({ locked: row.locked === 1, status: row.status, editableUntil: row.editableUntil }),
        confirmed: confirmed(row),
      };
    }),
  }));

  return c.json(ok({
    access: true,
    date,
    timeZone: admin.institutionTimeZone,
    activeUsers: residents.results.length,
    confirmedMeals: counts.reduce((sum, meal) => sum + meal.on, 0),
    openChoices: counts.reduce((sum, meal) => sum + meal.open, 0),
    counts,
    userMealStatus,
  }));
});
