import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import {
  addDays,
  computeEditableUntil,
  isMealEntryLocked,
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
  institutionTimeZone: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE";
  joinedAt: string | null;
};

type MealRow = {
  id: string;
  name: string;
  displayName: string;
  icon: string;
  defaultState: MealState;
  cutoffStrategy: CutoffStrategy;
  cutoffTime: string;
  cutoffOffsetMinutes: number;
  startTime: string;
  endTime: string;
};

type EntryRow = {
  id: string;
  mealId: string;
  serviceDate: string;
  status: MealEntryStatus;
  originalState: MealState;
  editableUntil: string;
  locked: number;
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
): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), actorUserId, action, entityType, entityId, detail);
}

function normalizeDate(value: string | undefined, timeZone: string): string {
  const result = value?.trim() || todayInZone(timeZone);
  parseDateKey(result);
  return result;
}

function dateRange(start: string, end: string): string[] {
  parseDateKey(start);
  parseDateKey(end);
  if (end < start) throw new Error("End date must be on or after start date");
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    if (dates.length > 366) throw new Error("Leave cannot exceed 366 days");
    cursor = addDays(cursor, 1);
  }
  return dates;
}

async function activeMeals(db: D1Database, institutionId: string): Promise<MealRow[]> {
  const result = await db
    .prepare(`
      SELECT id,
             name,
             display_name AS displayName,
             icon,
             default_state AS defaultState,
             cutoff_strategy AS cutoffStrategy,
             cutoff_time AS cutoffTime,
             cutoff_offset_minutes AS cutoffOffsetMinutes,
             start_time AS startTime,
             end_time AS endTime
      FROM meal_configurations
      WHERE institution_id = ? AND status = 'ACTIVE'
      ORDER BY display_order ASC, created_at ASC
    `)
    .bind(institutionId)
    .all<MealRow>();
  return result.results;
}

async function ensureResidentEntries(
  db: D1Database,
  user: SessionUser,
  serviceDate: string,
): Promise<EntryRow[]> {
  if (user.joinedAt && serviceDate < user.joinedAt.slice(0, 10)) {
    return [];
  }
  const meals = await activeMeals(db, user.institutionId);
  const now = new Date();
  const creates: D1PreparedStatement[] = [];
  for (const meal of meals) {
    const editableUntil = computeEditableUntil(meal, serviceDate, user.institutionTimeZone);
    const locked = editableUntil.getTime() <= now.getTime();
    const status: MealEntryStatus = locked && meal.defaultState === "ON" ? "LOCKED" : meal.defaultState;
    creates.push(
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
        locked ? 1 : 0,
      ),
    );
  }
  if (creates.length > 0) await db.batch(creates);
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
  const entries = await db
    .prepare(`
      SELECT id,
             meal_id AS mealId,
             service_date AS serviceDate,
             status,
             original_state AS originalState,
             editable_until AS editableUntil,
             locked
      FROM meal_entries
      WHERE user_id = ? AND service_date = ?
    `)
    .bind(user.id, serviceDate)
    .all<EntryRow>();
  return entries.results;
}

export const mealOperationsRouter = new Hono<AppEnv>();

// Resident presets -----------------------------------------------------------

mealOperationsRouter.get("/meals/presets", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  const presets = await c.env.DB
    .prepare(`
      SELECT id, name, description
      FROM meal_presets
      WHERE institution_id = ?
      ORDER BY name COLLATE NOCASE ASC
    `)
    .bind(user.institutionId)
    .all<{ id: string; name: string; description: string | null }>();
  const items = await c.env.DB
    .prepare(`
      SELECT pi.preset_id AS presetId,
             pi.meal_id AS mealId,
             pi.desired_state AS desiredState,
             m.display_name AS mealName,
             m.icon AS mealIcon
      FROM meal_preset_items pi
      JOIN meal_presets p ON p.id = pi.preset_id
      JOIN meal_configurations m ON m.id = pi.meal_id
      WHERE p.institution_id = ? AND m.status = 'ACTIVE'
      ORDER BY m.display_order ASC
    `)
    .bind(user.institutionId)
    .all<{ presetId: string; mealId: string; desiredState: MealState; mealName: string; mealIcon: string }>();
  return c.json(ok({
    presets: presets.results.map((preset) => ({
      ...preset,
      items: items.results.filter((item) => item.presetId === preset.id),
    })),
  }));
});

const applyPresetSchema = z.object({
  presetId: z.string().min(1),
  serviceDate: z.string().min(10),
});

mealOperationsRouter.post("/meals/presets/apply", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  if (user.role !== "USER") return c.json(fail("Resident account required"), 403);
  const parsed = applyPresetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid preset request"), 400);
  let serviceDate: string;
  try {
    serviceDate = normalizeDate(parsed.data.serviceDate, user.institutionTimeZone);
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid date"), 400);
  }
  if (user.joinedAt && serviceDate < user.joinedAt.slice(0, 10)) {
    return c.json(fail("This date is before your enrollment"), 422);
  }
  const preset = await c.env.DB
    .prepare("SELECT id, name FROM meal_presets WHERE id = ? AND institution_id = ? LIMIT 1")
    .bind(parsed.data.presetId, user.institutionId)
    .first<{ id: string; name: string }>();
  if (!preset) return c.json(fail("Meal preset not found"), 404);
  const items = await c.env.DB
    .prepare(`
      SELECT pi.meal_id AS mealId, pi.desired_state AS desiredState
      FROM meal_preset_items pi
      JOIN meal_configurations m ON m.id = pi.meal_id
      WHERE pi.preset_id = ? AND m.institution_id = ? AND m.status = 'ACTIVE'
    `)
    .bind(preset.id, user.institutionId)
    .all<{ mealId: string; desiredState: MealState }>();
  if (items.results.length === 0) return c.json(fail("This preset has no active meal items"), 422);

  const entries = await ensureResidentEntries(c.env.DB, user, serviceDate);
  const statements: D1PreparedStatement[] = [];
  const changed: string[] = [];
  const skippedLocked: string[] = [];
  for (const item of items.results) {
    const entry = entries.find((candidate) => candidate.mealId === item.mealId);
    if (!entry) continue;
    if (isMealEntryLocked({ locked: entry.locked === 1, status: entry.status, editableUntil: entry.editableUntil })) {
      skippedLocked.push(item.mealId);
      continue;
    }
    if (entry.status === item.desiredState && entry.originalState === item.desiredState) continue;
    changed.push(item.mealId);
    statements.push(
      c.env.DB
        .prepare("UPDATE meal_entries SET status = ?, original_state = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(item.desiredState, item.desiredState, user.id, entry.id),
      c.env.DB
        .prepare(`INSERT INTO meal_history (id, meal_entry_id, meal_id, user_id, old_status, new_status, changed_by, trigger_source, reason) VALUES (?, ?, ?, ?, ?, ?, ?, 'PRESET', ?)`)
        .bind(crypto.randomUUID(), entry.id, entry.mealId, user.id, entry.status, item.desiredState, user.id, `Preset: ${preset.name}`),
    );
  }
  if (statements.length > 0) {
    statements.push(auditStatement(
      c.env.DB,
      user.id,
      "MEAL_PRESET_APPLY",
      "MealPreset",
      preset.id,
      JSON.stringify({ serviceDate, changed, skippedLocked }),
    ));
    await c.env.DB.batch(statements);
  }
  return c.json(ok({ presetId: preset.id, changed, skippedLocked }));
});

// Administrator meal overrides ----------------------------------------------

const overrideSchema = z.object({
  mealId: z.string().min(1),
  userId: z.string().min(1),
  serviceDate: z.string().min(10),
  action: z.enum(["TURN_ON", "TURN_OFF"]),
  reason: z.string().trim().min(3).max(500),
});

mealOperationsRouter.post("/meals/override", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = overrideSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid override"), 400);
  let serviceDate: string;
  try {
    serviceDate = normalizeDate(parsed.data.serviceDate, admin.institutionTimeZone);
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid date"), 400);
  }
  const target = await c.env.DB
    .prepare(`
      SELECT id, institution_id AS institutionId, role, status, joined_at AS joinedAt
      FROM users
      WHERE id = ? AND institution_id = ? AND role = 'USER' AND status = 'ACTIVE'
      LIMIT 1
    `)
    .bind(parsed.data.userId, admin.institutionId)
    .first<{ id: string; institutionId: string; role: "USER"; status: "ACTIVE"; joinedAt: string | null }>();
  if (!target) return c.json(fail("Active resident not found"), 404);
  const meal = await c.env.DB
    .prepare(`
      SELECT id,
             name,
             display_name AS displayName,
             icon,
             default_state AS defaultState,
             cutoff_strategy AS cutoffStrategy,
             cutoff_time AS cutoffTime,
             cutoff_offset_minutes AS cutoffOffsetMinutes,
             start_time AS startTime,
             end_time AS endTime
      FROM meal_configurations
      WHERE id = ? AND institution_id = ? AND status = 'ACTIVE'
      LIMIT 1
    `)
    .bind(parsed.data.mealId, admin.institutionId)
    .first<MealRow>();
  if (!meal) return c.json(fail("Meal not found or inactive"), 404);

  const entry = await c.env.DB
    .prepare(`
      SELECT id,
             meal_id AS mealId,
             service_date AS serviceDate,
             status,
             original_state AS originalState,
             editable_until AS editableUntil,
             locked
      FROM meal_entries
      WHERE user_id = ? AND meal_id = ? AND service_date = ?
      LIMIT 1
    `)
    .bind(target.id, meal.id, serviceDate)
    .first<EntryRow>();
  const preEnrollment = Boolean(target.joinedAt && serviceDate < target.joinedAt.slice(0, 10));
  const editableUntil = computeEditableUntil(meal, serviceDate, admin.institutionTimeZone);
  if (entry) {
    if (!isMealEntryLocked({ locked: entry.locked === 1, status: entry.status, editableUntil: entry.editableUntil })) {
      return c.json(fail("This meal is still editable by the resident. Administrator override is available only after cutoff."), 422);
    }
  } else if (!preEnrollment && editableUntil.getTime() > Date.now()) {
    return c.json(fail("This meal is still editable by the resident. Administrator override is available only after cutoff."), 422);
  }

  const newStatus: MealState = parsed.data.action === "TURN_ON" ? "ON" : "OFF";
  if (!entry) {
    const id = crypto.randomUUID();
    const originalState: MealState = preEnrollment ? "OFF" : meal.defaultState;
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO meal_entries
          (id, user_id, meal_id, service_date, status, original_state, editable_until, locked, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).bind(id, target.id, meal.id, serviceDate, newStatus, originalState, editableUntil.toISOString(), admin.id),
      auditStatement(
        c.env.DB,
        admin.id,
        "MEAL_OVERRIDE",
        "MealEntry",
        id,
        JSON.stringify({ residentId: target.id, mealId: meal.id, serviceDate, action: parsed.data.action, reason: parsed.data.reason, originalState }),
      ),
    ]);
    return c.json(ok({ changed: true, entryId: id, status: newStatus, originalState }));
  }

  const effectiveOld: MealState = entry.status === "LOCKED" ? "ON" : entry.status;
  if (effectiveOld === newStatus) return c.json(ok({ changed: false, entryId: entry.id, status: entry.status, originalState: entry.originalState }));
  await c.env.DB.batch([
    c.env.DB
      .prepare("UPDATE meal_entries SET status = ?, locked = 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(newStatus, admin.id, entry.id),
    c.env.DB
      .prepare(`INSERT INTO meal_history (id, meal_entry_id, meal_id, user_id, old_status, new_status, changed_by, trigger_source, reason) VALUES (?, ?, ?, ?, ?, ?, ?, 'ADMIN_OVERRIDE', ?)`)
      .bind(crypto.randomUUID(), entry.id, meal.id, target.id, entry.status, newStatus, admin.id, parsed.data.reason),
    auditStatement(
      c.env.DB,
      admin.id,
      "MEAL_OVERRIDE",
      "MealEntry",
      entry.id,
      JSON.stringify({ residentId: target.id, mealId: meal.id, serviceDate, from: entry.status, to: newStatus, reason: parsed.data.reason }),
    ),
  ]);
  return c.json(ok({ changed: true, entryId: entry.id, status: newStatus, originalState: entry.originalState }));
});

// Guest meals ---------------------------------------------------------------

const guestSchema = z.object({
  mealId: z.string().min(1),
  serviceDate: z.string().min(10),
  guestCount: z.number().int().min(1).max(100),
  guestName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(300).optional(),
});

mealOperationsRouter.get("/kitchen/guests", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  let date: string;
  try {
    date = normalizeDate(c.req.query("date"), admin.institutionTimeZone);
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid date"), 400);
  }
  const result = await c.env.DB
    .prepare(`
      SELECT g.id,
             g.meal_id AS mealId,
             g.service_date AS serviceDate,
             g.guest_count AS guestCount,
             g.guest_name AS guestName,
             g.notes,
             g.created_at AS createdAt,
             m.display_name AS mealName,
             m.icon AS mealIcon
      FROM guest_meals g
      JOIN meal_configurations m ON m.id = g.meal_id
      WHERE g.institution_id = ? AND g.service_date = ? AND g.status = 'ACTIVE'
      ORDER BY m.display_order ASC, g.created_at ASC
    `)
    .bind(admin.institutionId, date)
    .all<{ id: string; mealId: string; serviceDate: string; guestCount: number; guestName: string | null; notes: string | null; createdAt: string; mealName: string; mealIcon: string }>();
  const totals = new Map<string, number>();
  for (const item of result.results) totals.set(item.mealId, (totals.get(item.mealId) ?? 0) + item.guestCount);
  return c.json(ok({
    date,
    entries: result.results,
    totals: Array.from(totals, ([mealId, guests]) => ({ mealId, guests })),
    totalGuests: result.results.reduce((sum, item) => sum + item.guestCount, 0),
  }));
});

mealOperationsRouter.post("/kitchen/guests", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = guestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid guest meal"), 400);
  let serviceDate: string;
  try {
    serviceDate = normalizeDate(parsed.data.serviceDate, admin.institutionTimeZone);
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid date"), 400);
  }
  const meal = await c.env.DB
    .prepare("SELECT id, display_name AS displayName FROM meal_configurations WHERE id = ? AND institution_id = ? AND status = 'ACTIVE' LIMIT 1")
    .bind(parsed.data.mealId, admin.institutionId)
    .first<{ id: string; displayName: string }>();
  if (!meal) return c.json(fail("Meal not found or inactive"), 404);
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO guest_meals
        (id, institution_id, meal_id, service_date, guest_count, guest_name, notes, created_by, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).bind(
      id,
      admin.institutionId,
      meal.id,
      serviceDate,
      parsed.data.guestCount,
      parsed.data.guestName || null,
      parsed.data.notes || null,
      admin.id,
    ),
    auditStatement(c.env.DB, admin.id, "GUEST_MEAL_ADD", "GuestMeal", id, JSON.stringify({ mealId: meal.id, serviceDate, guestCount: parsed.data.guestCount })),
  ]);
  return c.json(ok({ id }), 201);
});

mealOperationsRouter.delete("/kitchen/guests/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const guest = await c.env.DB
    .prepare("SELECT id, meal_id AS mealId, service_date AS serviceDate, guest_count AS guestCount FROM guest_meals WHERE id = ? AND institution_id = ? AND status = 'ACTIVE' LIMIT 1")
    .bind(c.req.param("id"), admin.institutionId)
    .first<{ id: string; mealId: string; serviceDate: string; guestCount: number }>();
  if (!guest) return c.json(fail("Active guest meal not found"), 404);
  const body = await c.req.json().catch(() => ({})) as { reason?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "Cancelled by administrator";
  await c.env.DB.batch([
    c.env.DB
      .prepare("UPDATE guest_meals SET status = 'CANCELLED', cancelled_by = ?, cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(admin.id, guest.id),
    auditStatement(c.env.DB, admin.id, "GUEST_MEAL_CANCEL", "GuestMeal", guest.id, JSON.stringify({ ...guest, reason })),
  ]);
  return c.json(ok({ cancelled: true }));
});

// Leave workflow -------------------------------------------------------------

const leaveCreateSchema = z.object({
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  reason: z.string().trim().min(3).max(500),
  mealType: z.enum(["ALL", "SPECIFIC"]).default("ALL"),
  mealIds: z.array(z.string().min(1)).max(20).default([]),
});

function parseMealIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function leaveApplications(db: D1Database, viewer: SessionUser) {
  const where = viewer.role === "USER" ? "l.user_id = ?" : "l.institution_id = ?";
  const binding = viewer.role === "USER" ? viewer.id : viewer.institutionId;
  const result = await db
    .prepare(`
      SELECT l.id,
             l.user_id AS userId,
             l.start_date AS startDate,
             l.end_date AS endDate,
             l.reason,
             l.meal_type AS mealType,
             l.meal_ids_json AS mealIdsJson,
             l.status,
             l.admin_notes AS adminNotes,
             l.decided_at AS decidedAt,
             l.created_at AS createdAt,
             u.name AS userName,
             u.email AS userEmail,
             u.room
      FROM leave_applications l
      JOIN users u ON u.id = l.user_id
      WHERE ${where}
      ORDER BY CASE l.status WHEN 'PENDING' THEN 0 ELSE 1 END, l.created_at DESC
    `)
    .bind(binding)
    .all<{
      id: string;
      userId: string;
      startDate: string;
      endDate: string;
      reason: string;
      mealType: "ALL" | "SPECIFIC";
      mealIdsJson: string;
      status: "PENDING" | "APPROVED" | "REJECTED";
      adminNotes: string | null;
      decidedAt: string | null;
      createdAt: string;
      userName: string;
      userEmail: string;
      room: string | null;
    }>();
  return result.results.map((application) => ({
    ...application,
    mealIds: parseMealIds(application.mealIdsJson),
    mealIdsJson: undefined,
  }));
}

mealOperationsRouter.get("/leave", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  return c.json(ok({ applications: await leaveApplications(c.env.DB, user) }));
});

mealOperationsRouter.post("/leave", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  if (user.role !== "USER") return c.json(fail("Resident account required"), 403);
  const parsed = leaveCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid leave application"), 400);
  let dates: string[];
  try {
    dates = dateRange(parsed.data.startDate, parsed.data.endDate);
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid leave dates"), 400);
  }
  if (user.joinedAt && dates[0]! < user.joinedAt.slice(0, 10)) {
    return c.json(fail("Leave cannot start before your enrollment date"), 422);
  }
  if (parsed.data.mealType === "SPECIFIC") {
    if (parsed.data.mealIds.length === 0) return c.json(fail("Select at least one meal"), 400);
    const placeholders = parsed.data.mealIds.map(() => "?").join(", ");
    const valid = await c.env.DB
      .prepare(`SELECT id FROM meal_configurations WHERE institution_id = ? AND status = 'ACTIVE' AND id IN (${placeholders})`)
      .bind(user.institutionId, ...parsed.data.mealIds)
      .all<{ id: string }>();
    if (valid.results.length !== new Set(parsed.data.mealIds).size) return c.json(fail("One or more selected meals are invalid or inactive"), 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO leave_applications
        (id, institution_id, user_id, start_date, end_date, reason, meal_type, meal_ids_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).bind(id, user.institutionId, user.id, dates[0]!, dates[dates.length - 1]!, parsed.data.reason, parsed.data.mealType, JSON.stringify(parsed.data.mealIds)),
    auditStatement(c.env.DB, user.id, "LEAVE_REQUEST", "LeaveApplication", id, JSON.stringify({ startDate: dates[0], endDate: dates[dates.length - 1], mealType: parsed.data.mealType })),
  ]);
  return c.json(ok({ id }), 201);
});

const leaveDecisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  adminNotes: z.string().trim().max(500).optional(),
});

mealOperationsRouter.patch("/leave/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = leaveDecisionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid leave decision"), 400);
  const application = await c.env.DB
    .prepare(`
      SELECT l.id,
             l.user_id AS userId,
             l.start_date AS startDate,
             l.end_date AS endDate,
             l.reason,
             l.meal_type AS mealType,
             l.meal_ids_json AS mealIdsJson,
             l.status,
             u.name AS userName
      FROM leave_applications l
      JOIN users u ON u.id = l.user_id
      WHERE l.id = ? AND l.institution_id = ?
      LIMIT 1
    `)
    .bind(c.req.param("id"), admin.institutionId)
    .first<{
      id: string;
      userId: string;
      startDate: string;
      endDate: string;
      reason: string;
      mealType: "ALL" | "SPECIFIC";
      mealIdsJson: string;
      status: "PENDING" | "APPROVED" | "REJECTED";
      userName: string;
    }>();
  if (!application) return c.json(fail("Leave application not found"), 404);
  if (application.status !== "PENDING") return c.json(fail(`Leave application is already ${application.status.toLowerCase()}`), 409);

  if (parsed.data.status === "REJECTED") {
    await c.env.DB.batch([
      c.env.DB
        .prepare("UPDATE leave_applications SET status = 'REJECTED', admin_notes = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'")
        .bind(parsed.data.adminNotes || null, admin.id, application.id),
      auditStatement(c.env.DB, admin.id, "LEAVE_REJECT", "LeaveApplication", application.id, JSON.stringify({ userId: application.userId, adminNotes: parsed.data.adminNotes || null })),
    ]);
    return c.json(ok({ status: "REJECTED", affectedMealEntries: 0 }));
  }

  let dates: string[];
  try {
    dates = dateRange(application.startDate, application.endDate);
  } catch (error) {
    return c.json(fail(error instanceof Error ? error.message : "Invalid leave dates"), 409);
  }
  const allMeals = await activeMeals(c.env.DB, admin.institutionId);
  const requestedIds = parseMealIds(application.mealIdsJson);
  const meals = application.mealType === "SPECIFIC"
    ? allMeals.filter((meal) => requestedIds.includes(meal.id))
    : allMeals;
  if (meals.length === 0) return c.json(fail("No active meals are available for this leave application"), 409);
  if (application.mealType === "SPECIFIC" && meals.length !== new Set(requestedIds).size) {
    return c.json(fail("One or more meals selected by this leave application are no longer active"), 409);
  }

  const mealPlaceholders = meals.map(() => "?").join(", ");
  const existing = await c.env.DB
    .prepare(`
      SELECT id,
             meal_id AS mealId,
             service_date AS serviceDate,
             status,
             original_state AS originalState,
             editable_until AS editableUntil,
             locked
      FROM meal_entries
      WHERE user_id = ? AND service_date >= ? AND service_date <= ? AND meal_id IN (${mealPlaceholders})
    `)
    .bind(application.userId, application.startDate, application.endDate, ...meals.map((meal) => meal.id))
    .all<EntryRow>();
  const existingMap = new Map(existing.results.map((entry) => [`${entry.mealId}:${entry.serviceDate}`, entry]));

  const payload = dates.flatMap((serviceDate) => meals.map((meal) => {
    const prior = existingMap.get(`${meal.id}:${serviceDate}`);
    return {
      id: prior?.id ?? crypto.randomUUID(),
      userId: application.userId,
      mealId: meal.id,
      serviceDate,
      status: "OFF",
      originalState: "OFF",
      editableUntil: computeEditableUntil(meal, serviceDate, admin.institutionTimeZone).toISOString(),
      locked: 1,
      updatedBy: admin.id,
    };
  }));

  const historyPayload = existing.results
    .filter((entry) => !(entry.status === "OFF" && entry.originalState === "OFF" && entry.locked === 1))
    .map((entry) => ({
      id: crypto.randomUUID(),
      mealEntryId: entry.id,
      mealId: entry.mealId,
      userId: application.userId,
      oldStatus: entry.status,
      newStatus: "OFF",
      changedBy: admin.id,
      reason: `Approved leave ${application.id}`,
    }));

  const statements: D1PreparedStatement[] = [];
  if (historyPayload.length > 0) {
    statements.push(
      c.env.DB.prepare(`
        INSERT INTO meal_history
          (id, meal_entry_id, meal_id, user_id, old_status, new_status, changed_by, trigger_source, reason)
        SELECT json_extract(value, '$.id'),
               json_extract(value, '$.mealEntryId'),
               json_extract(value, '$.mealId'),
               json_extract(value, '$.userId'),
               json_extract(value, '$.oldStatus'),
               json_extract(value, '$.newStatus'),
               json_extract(value, '$.changedBy'),
               'LEAVE',
               json_extract(value, '$.reason')
        FROM json_each(?)
      `).bind(JSON.stringify(historyPayload)),
    );
  }
  statements.push(
    c.env.DB.prepare(`
      INSERT INTO meal_entries
        (id, user_id, meal_id, service_date, status, original_state, editable_until, locked, updated_by)
      SELECT json_extract(value, '$.id'),
             json_extract(value, '$.userId'),
             json_extract(value, '$.mealId'),
             json_extract(value, '$.serviceDate'),
             'OFF',
             'OFF',
             json_extract(value, '$.editableUntil'),
             1,
             json_extract(value, '$.updatedBy')
      FROM json_each(?)
      WHERE 1 = 1
      ON CONFLICT(user_id, meal_id, service_date) DO UPDATE SET
        status = 'OFF',
        original_state = 'OFF',
        editable_until = excluded.editable_until,
        locked = 1,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `).bind(JSON.stringify(payload)),
    c.env.DB
      .prepare("UPDATE leave_applications SET status = 'APPROVED', admin_notes = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'")
      .bind(parsed.data.adminNotes || null, admin.id, application.id),
    auditStatement(
      c.env.DB,
      admin.id,
      "LEAVE_APPROVE",
      "LeaveApplication",
      application.id,
      JSON.stringify({ userId: application.userId, startDate: application.startDate, endDate: application.endDate, mealType: application.mealType, affectedMealEntries: payload.length }),
    ),
  );
  await c.env.DB.batch(statements);
  return c.json(ok({ status: "APPROVED", affectedMealEntries: payload.length }));
});
