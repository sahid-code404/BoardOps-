import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";

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

type CalendarEventRow = {
  id: string;
  institutionId: string;
  name: string;
  startDate: string;
  endDate: string;
  mealsDisabled: number;
  status: "ACTIVE" | "ARCHIVED";
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
      SELECT u.id,
             u.institution_id AS institutionId,
             u.role
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

function auditStatement(db: D1Database, actorUserId: string, event: CalendarEventRow): D1PreparedStatement {
  return db
    .prepare(`
      INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail)
      VALUES (?, ?, 'CALENDAR_EVENT_ARCHIVE', 'CalendarEvent', ?, ?)
    `)
    .bind(
      crypto.randomUUID(),
      actorUserId,
      event.id,
      JSON.stringify({
        name: event.name,
        startDate: event.startDate,
        endDate: event.endDate,
        mealsDisabled: event.mealsDisabled === 1,
      }),
    );
}

export const calendarArchiveRouter = new Hono<AppEnv>();

calendarArchiveRouter.delete("/calendar/events/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);

  const existing = await c.env.DB
    .prepare(`
      SELECT id,
             institution_id AS institutionId,
             name,
             start_date AS startDate,
             end_date AS endDate,
             meals_disabled AS mealsDisabled,
             status
      FROM calendar_events
      WHERE id = ? AND institution_id = ?
      LIMIT 1
    `)
    .bind(c.req.param("id"), admin.institutionId)
    .first<CalendarEventRow>();

  if (!existing) return c.json(fail("Calendar event not found"), 404);
  if (existing.status === "ARCHIVED") return c.json(ok({ archived: true, changed: false, restoredMealEntries: 0 }));

  const restorable = existing.mealsDisabled === 1
    ? await c.env.DB
        .prepare(`
          SELECT COUNT(*) AS count
          FROM calendar_meal_effects effect
          JOIN meal_entries e ON e.id = effect.meal_entry_id
          WHERE effect.event_id = ?
            AND effect.reverted_at IS NULL
            AND e.editable_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            AND e.original_state = effect.prior_original_state
        `)
        .bind(existing.id)
        .first<{ count: number }>()
    : null;

  const statements: D1PreparedStatement[] = [
    c.env.DB
      .prepare(`
        UPDATE calendar_events
        SET status = 'ARCHIVED', updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND institution_id = ? AND status = 'ACTIVE'
      `)
      .bind(admin.id, existing.id, admin.institutionId),
  ];

  if (existing.mealsDisabled === 1) {
    statements.push(
      c.env.DB.prepare(`
        INSERT INTO meal_history
          (id, meal_entry_id, meal_id, user_id, old_status, new_status, changed_by, trigger_source, reason)
        SELECT lower(hex(randomblob(16))),
               e.id,
               e.meal_id,
               e.user_id,
               e.status,
               effect.prior_status,
               ?,
               'SYSTEM',
               'Calendar event archived ' || ? || ': ' || ?
        FROM calendar_meal_effects effect
        JOIN meal_entries e ON e.id = effect.meal_entry_id
        WHERE effect.event_id = ?
          AND effect.reverted_at IS NULL
          AND e.editable_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          AND e.original_state = effect.prior_original_state
          AND (e.status <> effect.prior_status OR e.locked <> effect.prior_locked)
      `).bind(admin.id, existing.id, existing.name, existing.id),
      c.env.DB.prepare(`
        UPDATE meal_entries
        SET status = (
              SELECT effect.prior_status
              FROM calendar_meal_effects effect
              WHERE effect.event_id = ? AND effect.meal_entry_id = meal_entries.id
            ),
            locked = (
              SELECT effect.prior_locked
              FROM calendar_meal_effects effect
              WHERE effect.event_id = ? AND effect.meal_entry_id = meal_entries.id
            ),
            updated_by = (
              SELECT effect.prior_updated_by
              FROM calendar_meal_effects effect
              WHERE effect.event_id = ? AND effect.meal_entry_id = meal_entries.id
            ),
            updated_at = CURRENT_TIMESTAMP
        WHERE id IN (
          SELECT e.id
          FROM calendar_meal_effects effect
          JOIN meal_entries e ON e.id = effect.meal_entry_id
          WHERE effect.event_id = ?
            AND effect.reverted_at IS NULL
            AND e.editable_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            AND e.original_state = effect.prior_original_state
        )
      `).bind(existing.id, existing.id, existing.id, existing.id),
      c.env.DB
        .prepare("UPDATE calendar_meal_effects SET reverted_at = CURRENT_TIMESTAMP WHERE event_id = ? AND reverted_at IS NULL")
        .bind(existing.id),
    );
  }

  statements.push(auditStatement(c.env.DB, admin.id, existing));

  try {
    await c.env.DB.batch(statements);
  } catch (error) {
    console.error("Calendar archive failed", existing.id, error instanceof Error ? error.message : String(error));
    return c.json(fail("Calendar event could not be archived safely. No changes were committed."), 409);
  }

  const archived = await c.env.DB
    .prepare("SELECT status FROM calendar_events WHERE id = ? AND institution_id = ? LIMIT 1")
    .bind(existing.id, admin.institutionId)
    .first<{ status: "ACTIVE" | "ARCHIVED" }>();

  if (archived?.status !== "ARCHIVED") {
    return c.json(fail("Calendar event archive did not persist"), 409);
  }

  return c.json(ok({
    archived: true,
    changed: true,
    restoredMealEntries: restorable?.count ?? 0,
  }));
});
