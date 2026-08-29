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
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE";
};

type PaymentRow = {
  id: string;
  userId: string;
  userName: string;
  room: string | null;
  amountMinor: number;
  currency: string;
  method: "CASH" | "BANK_TRANSFER" | "UPI" | "CARD" | "OTHER";
  reference: string | null;
  note: string | null;
  postedByName: string;
  postedAt: string;
  reversalId: string | null;
  reversalReason: string | null;
  reversedByName: string | null;
  reversedAt: string | null;
};

type LedgerRow = {
  id: string;
  direction: "CREDIT" | "DEBIT";
  amountMinor: number;
  currency: string;
  entryType: string;
  sourceType: string;
  sourceId: string;
  narrative: string;
  postedByName: string;
  postedAt: string;
};

type CommandRow = {
  id: string;
  requestHash: string;
  resultEntityId: string;
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

async function stableId(prefix: string, value: string): Promise<string> {
  return `${prefix}-${(await sha256(value)).slice(0, 32)}`;
}

function moneyText(amountMinor: number, currency: string): string {
  const sign = amountMinor < 0 ? "-" : "";
  const digits = String(Math.abs(amountMinor)).padStart(3, "0");
  const major = digits.slice(0, -2);
  const minor = digits.slice(-2);
  return `${sign}${currency} ${major}.${minor}`;
}

async function currentUser(c: Context<AppEnv>): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return await c.env.DB
    .prepare(`
      SELECT u.id,
             u.institution_id AS institutionId,
             u.email,
             u.name,
             u.role,
             u.status
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

async function paymentById(db: D1Database, institutionId: string, paymentId: string): Promise<PaymentRow | null> {
  return await db
    .prepare(`
      SELECT p.id,
             p.user_id AS userId,
             u.name AS userName,
             u.room,
             p.amount_minor AS amountMinor,
             p.currency,
             p.method,
             p.reference,
             p.note,
             poster.name AS postedByName,
             p.posted_at AS postedAt,
             r.id AS reversalId,
             r.reason AS reversalReason,
             reverser.name AS reversedByName,
             r.reversed_at AS reversedAt
      FROM payments p
      JOIN users u ON u.id = p.user_id
      JOIN users poster ON poster.id = p.posted_by
      LEFT JOIN payment_reversals r ON r.payment_id = p.id
      LEFT JOIN users reverser ON reverser.id = r.reversed_by
      WHERE p.id = ? AND p.institution_id = ?
      LIMIT 1
    `)
    .bind(paymentId, institutionId)
    .first<PaymentRow>();
}

async function commandByKey(
  db: D1Database,
  institutionId: string,
  commandType: "PAYMENT_POST" | "PAYMENT_REVERSE",
  idempotencyKey: string,
): Promise<CommandRow | null> {
  return await db
    .prepare(`
      SELECT id, request_hash AS requestHash, result_entity_id AS resultEntityId
      FROM accounting_commands
      WHERE institution_id = ? AND command_type = ? AND idempotency_key = ?
      LIMIT 1
    `)
    .bind(institutionId, commandType, idempotencyKey)
    .first<CommandRow>();
}

function deterministicAudit(
  db: D1Database,
  id: string,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
): D1PreparedStatement {
  return db
    .prepare(`
      INSERT OR IGNORE INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(id, actorUserId, action, entityType, entityId, detail);
}

const amountMinorSchema = z
  .number()
  .int()
  .positive()
  .max(9_000_000_000_000_000)
  .refine(Number.isSafeInteger, { message: "Amount must be a safe integer in minor units" });

const idempotencyKeySchema = z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/, "Invalid idempotency key");

const postPaymentSchema = z.object({
  userId: z.string().min(1),
  amountMinor: amountMinorSchema,
  method: z.enum(["CASH", "BANK_TRANSFER", "UPI", "CARD", "OTHER"]),
  reference: z.string().trim().max(160).optional(),
  note: z.string().trim().max(500).optional(),
  idempotencyKey: idempotencyKeySchema,
});

const reversePaymentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: idempotencyKeySchema,
});

export const accountingRouter = new Hono<AppEnv>();

accountingRouter.get("/payments", async (c) => {
  const viewer = await currentUser(c);
  if (!viewer) return c.json(fail("Not authenticated"), 401);

  const requestedUserId = c.req.query("userId")?.trim();
  if (viewer.role === "USER" && requestedUserId && requestedUserId !== viewer.id) {
    return c.json(fail("You can view only your own payments"), 403);
  }
  const userId = viewer.role === "USER" ? viewer.id : requestedUserId;
  const clause = userId ? "AND p.user_id = ?" : "";
  const bindings = userId ? [viewer.institutionId, userId] : [viewer.institutionId];

  const payments = await c.env.DB
    .prepare(`
      SELECT p.id,
             p.user_id AS userId,
             u.name AS userName,
             u.room,
             p.amount_minor AS amountMinor,
             p.currency,
             p.method,
             p.reference,
             p.note,
             poster.name AS postedByName,
             p.posted_at AS postedAt,
             r.id AS reversalId,
             r.reason AS reversalReason,
             reverser.name AS reversedByName,
             r.reversed_at AS reversedAt
      FROM payments p
      JOIN users u ON u.id = p.user_id
      JOIN users poster ON poster.id = p.posted_by
      LEFT JOIN payment_reversals r ON r.payment_id = p.id
      LEFT JOIN users reverser ON reverser.id = r.reversed_by
      WHERE p.institution_id = ? ${clause}
      ORDER BY p.posted_at DESC, p.id DESC
      LIMIT 250
    `)
    .bind(...bindings)
    .all<PaymentRow>();

  return c.json(ok({ payments: payments.results }));
});

accountingRouter.get("/funds/summary", async (c) => {
  const viewer = await currentUser(c);
  if (!viewer) return c.json(fail("Not authenticated"), 401);

  if (viewer.role === "USER") {
    const row = await c.env.DB
      .prepare(`
        SELECT COALESCE(SUM(CASE direction WHEN 'CREDIT' THEN amount_minor ELSE -amount_minor END), 0) AS balanceMinor
        FROM ledger_entries
        WHERE institution_id = ? AND user_id = ?
      `)
      .bind(viewer.institutionId, viewer.id)
      .first<{ balanceMinor: number }>();
    return c.json(ok({ balanceMinor: row?.balanceMinor ?? 0, currency: "INR" }));
  }

  const balances = await c.env.DB
    .prepare(`
      SELECT u.id AS userId,
             u.name,
             u.room,
             u.institution_user_id AS institutionUserId,
             COALESCE(SUM(CASE l.direction WHEN 'CREDIT' THEN l.amount_minor WHEN 'DEBIT' THEN -l.amount_minor ELSE 0 END), 0) AS balanceMinor
      FROM users u
      LEFT JOIN ledger_entries l ON l.user_id = u.id AND l.institution_id = u.institution_id
      WHERE u.institution_id = ? AND u.role = 'USER' AND u.status = 'ACTIVE'
      GROUP BY u.id, u.name, u.room, u.institution_user_id
      ORDER BY u.name COLLATE NOCASE ASC
    `)
    .bind(viewer.institutionId)
    .all<{ userId: string; name: string; room: string | null; institutionUserId: string | null; balanceMinor: number }>();
  return c.json(ok({ currency: "INR", balances: balances.results }));
});

accountingRouter.get("/funds/ledger", async (c) => {
  const viewer = await currentUser(c);
  if (!viewer) return c.json(fail("Not authenticated"), 401);
  const requestedUserId = c.req.query("userId")?.trim();
  const userId = viewer.role === "USER" ? viewer.id : requestedUserId;
  if (!userId) return c.json(fail("Choose a resident to view the ledger"), 400);
  if (viewer.role === "USER" && requestedUserId && requestedUserId !== viewer.id) {
    return c.json(fail("You can view only your own ledger"), 403);
  }

  const resident = await c.env.DB
    .prepare(`
      SELECT id, name, room, institution_user_id AS institutionUserId
      FROM users
      WHERE id = ? AND institution_id = ? AND role = 'USER'
      LIMIT 1
    `)
    .bind(userId, viewer.institutionId)
    .first<{ id: string; name: string; room: string | null; institutionUserId: string | null }>();
  if (!resident) return c.json(fail("Resident not found"), 404);

  const ledger = await c.env.DB
    .prepare(`
      SELECT l.id,
             l.direction,
             l.amount_minor AS amountMinor,
             l.currency,
             l.entry_type AS entryType,
             l.source_type AS sourceType,
             l.source_id AS sourceId,
             l.narrative,
             poster.name AS postedByName,
             l.posted_at AS postedAt
      FROM ledger_entries l
      JOIN users poster ON poster.id = l.posted_by
      WHERE l.institution_id = ? AND l.user_id = ?
      ORDER BY l.posted_at DESC, l.id DESC
      LIMIT 500
    `)
    .bind(viewer.institutionId, userId)
    .all<LedgerRow>();

  const balanceMinor = ledger.results.reduce(
    (sum, entry) => sum + (entry.direction === "CREDIT" ? entry.amountMinor : -entry.amountMinor),
    0,
  );
  if (!Number.isSafeInteger(balanceMinor)) return c.json(fail("Ledger balance exceeds safe integer range"), 500);

  return c.json(ok({ resident, balanceMinor, currency: "INR", entries: ledger.results }));
});

accountingRouter.post("/payments", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);

  const parsed = postPaymentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid payment"), 400);

  const resident = await c.env.DB
    .prepare(`
      SELECT id, name
      FROM users
      WHERE id = ? AND institution_id = ? AND role = 'USER' AND status = 'ACTIVE'
      LIMIT 1
    `)
    .bind(parsed.data.userId, admin.institutionId)
    .first<{ id: string; name: string }>();
  if (!resident) return c.json(fail("Active resident not found"), 404);

  const normalized = {
    userId: resident.id,
    amountMinor: parsed.data.amountMinor,
    method: parsed.data.method,
    reference: parsed.data.reference?.trim() || null,
    note: parsed.data.note?.trim() || null,
  };
  const requestHash = await sha256(JSON.stringify(normalized));
  const existingCommand = await commandByKey(c.env.DB, admin.institutionId, "PAYMENT_POST", parsed.data.idempotencyKey);
  if (existingCommand) {
    if (existingCommand.requestHash !== requestHash) return c.json(fail("This idempotency key was already used for a different payment request"), 409);
    const existingPayment = await paymentById(c.env.DB, admin.institutionId, existingCommand.resultEntityId);
    if (!existingPayment) return c.json(fail("Idempotent payment command exists without its payment record"), 409);
    return c.json(ok({ payment: existingPayment, idempotent: true }));
  }

  const namespace = `${admin.institutionId}|PAYMENT_POST|${parsed.data.idempotencyKey}`;
  const commandId = await stableId("cmd", namespace);
  const paymentId = await stableId("pay", namespace);
  const ledgerId = await stableId("led", namespace);
  const auditId = await stableId("aud", namespace);
  const notificationId = await stableId("not", namespace);
  const outboxId = await stableId("out", namespace);
  const description = `Payment posted: ${moneyText(normalized.amountMinor, "INR")}`;

  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT OR IGNORE INTO accounting_commands
        (id, institution_id, command_type, idempotency_key, request_hash, result_entity_id, created_by)
      VALUES (?, ?, 'PAYMENT_POST', ?, ?, ?, ?)
    `).bind(commandId, admin.institutionId, parsed.data.idempotencyKey, requestHash, paymentId, admin.id),
    c.env.DB.prepare(`
      INSERT OR IGNORE INTO payments
        (id, institution_id, user_id, amount_minor, currency, method, reference, note, posted_by)
      VALUES (?, ?, ?, ?, 'INR', ?, ?, ?, ?)
    `).bind(paymentId, admin.institutionId, resident.id, normalized.amountMinor, normalized.method, normalized.reference, normalized.note, admin.id),
    c.env.DB.prepare(`
      INSERT OR IGNORE INTO ledger_entries
        (id, institution_id, user_id, direction, amount_minor, currency, entry_type, source_type, source_id, command_id, narrative, posted_by)
      VALUES (?, ?, ?, 'CREDIT', ?, 'INR', 'PAYMENT', 'PAYMENT', ?, ?, ?, ?)
    `).bind(ledgerId, admin.institutionId, resident.id, normalized.amountMinor, paymentId, commandId, `Payment received via ${normalized.method.replaceAll("_", " ").toLowerCase()}`, admin.id),
    c.env.DB.prepare(`
      INSERT OR IGNORE INTO notifications
        (id, institution_id, user_id, title, description, type, priority, route, source_type, source_id)
      VALUES (?, ?, ?, 'Payment received', ?, 'SUCCESS', 'NORMAL', '/payments', 'PAYMENT', ?)
    `).bind(notificationId, admin.institutionId, resident.id, description, paymentId),
    c.env.DB.prepare(`
      INSERT OR IGNORE INTO outbox_events
        (id, institution_id, event_type, aggregate_type, aggregate_id, dedupe_key, payload_json)
      VALUES (?, ?, 'payment.posted', 'Payment', ?, ?, ?)
    `).bind(outboxId, admin.institutionId, paymentId, `payment.posted:${paymentId}`, JSON.stringify({ paymentId, userId: resident.id, amountMinor: normalized.amountMinor, currency: "INR" })),
    deterministicAudit(c.env.DB, auditId, admin.id, "PAYMENT_POST", "Payment", paymentId, JSON.stringify({ ...normalized, currency: "INR" })),
  ]);

  const storedCommand = await commandByKey(c.env.DB, admin.institutionId, "PAYMENT_POST", parsed.data.idempotencyKey);
  if (!storedCommand || storedCommand.requestHash !== requestHash) {
    return c.json(fail("This idempotency key was claimed by a different payment request"), 409);
  }
  const payment = await paymentById(c.env.DB, admin.institutionId, storedCommand.resultEntityId);
  if (!payment) return c.json(fail("Payment posting did not persist"), 409);
  return c.json(ok({ payment, idempotent: storedCommand.resultEntityId !== paymentId }), 201);
});

accountingRouter.post("/payments/:id/reverse", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);

  const parsed = reversePaymentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid reversal"), 400);

  const payment = await paymentById(c.env.DB, admin.institutionId, c.req.param("id"));
  if (!payment) return c.json(fail("Payment not found"), 404);

  const normalized = { paymentId: payment.id, reason: parsed.data.reason.trim() };
  const requestHash = await sha256(JSON.stringify(normalized));
  const existingCommand = await commandByKey(c.env.DB, admin.institutionId, "PAYMENT_REVERSE", parsed.data.idempotencyKey);
  if (existingCommand) {
    if (existingCommand.requestHash !== requestHash) return c.json(fail("This idempotency key was already used for a different reversal request"), 409);
    const existingPayment = await paymentById(c.env.DB, admin.institutionId, payment.id);
    return c.json(ok({ payment: existingPayment ?? payment, idempotent: true }));
  }
  if (payment.reversalId) return c.json(fail("This payment has already been reversed"), 409);

  const namespace = `${admin.institutionId}|PAYMENT_REVERSE|${parsed.data.idempotencyKey}`;
  const commandId = await stableId("cmd", namespace);
  const reversalId = await stableId("rev", namespace);
  const ledgerId = await stableId("led", namespace);
  const auditId = await stableId("aud", namespace);
  const notificationId = await stableId("not", namespace);
  const outboxId = await stableId("out", namespace);

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO accounting_commands
          (id, institution_id, command_type, idempotency_key, request_hash, result_entity_id, created_by)
        VALUES (?, ?, 'PAYMENT_REVERSE', ?, ?, ?, ?)
      `).bind(commandId, admin.institutionId, parsed.data.idempotencyKey, requestHash, reversalId, admin.id),
      c.env.DB.prepare(`
        INSERT INTO payment_reversals
          (id, institution_id, payment_id, reason, reversed_by)
        VALUES (?, ?, ?, ?, ?)
      `).bind(reversalId, admin.institutionId, payment.id, normalized.reason, admin.id),
      c.env.DB.prepare(`
        INSERT INTO ledger_entries
          (id, institution_id, user_id, direction, amount_minor, currency, entry_type, source_type, source_id, command_id, narrative, posted_by)
        VALUES (?, ?, ?, 'DEBIT', ?, ?, 'PAYMENT_REVERSAL', 'PAYMENT_REVERSAL', ?, ?, ?, ?)
      `).bind(ledgerId, admin.institutionId, payment.userId, payment.amountMinor, payment.currency, reversalId, commandId, `Payment reversal: ${normalized.reason}`, admin.id),
      c.env.DB.prepare(`
        INSERT OR IGNORE INTO notifications
          (id, institution_id, user_id, title, description, type, priority, route, source_type, source_id)
        VALUES (?, ?, ?, 'Payment reversed', ?, 'WARNING', 'HIGH', '/payments', 'PAYMENT_REVERSAL', ?)
      `).bind(notificationId, admin.institutionId, payment.userId, `A payment of ${moneyText(payment.amountMinor, payment.currency)} was reversed.`, reversalId),
      c.env.DB.prepare(`
        INSERT OR IGNORE INTO outbox_events
          (id, institution_id, event_type, aggregate_type, aggregate_id, dedupe_key, payload_json)
        VALUES (?, ?, 'payment.reversed', 'PaymentReversal', ?, ?, ?)
      `).bind(outboxId, admin.institutionId, reversalId, `payment.reversed:${reversalId}`, JSON.stringify({ reversalId, paymentId: payment.id, userId: payment.userId, amountMinor: payment.amountMinor, currency: payment.currency, reason: normalized.reason })),
      deterministicAudit(c.env.DB, auditId, admin.id, "PAYMENT_REVERSE", "PaymentReversal", reversalId, JSON.stringify({ paymentId: payment.id, reason: normalized.reason, amountMinor: payment.amountMinor, currency: payment.currency })),
    ]);
  } catch (error) {
    const concurrentCommand = await commandByKey(c.env.DB, admin.institutionId, "PAYMENT_REVERSE", parsed.data.idempotencyKey);
    if (concurrentCommand?.requestHash === requestHash) {
      const existingPayment = await paymentById(c.env.DB, admin.institutionId, payment.id);
      if (existingPayment?.reversalId) return c.json(ok({ payment: existingPayment, idempotent: true }));
    }
    const current = await paymentById(c.env.DB, admin.institutionId, payment.id);
    if (current?.reversalId) return c.json(fail("This payment has already been reversed"), 409);
    console.error("Payment reversal failed", payment.id, error instanceof Error ? error.message : String(error));
    return c.json(fail("Payment reversal could not be posted atomically"), 409);
  }

  const updated = await paymentById(c.env.DB, admin.institutionId, payment.id);
  if (!updated?.reversalId) return c.json(fail("Payment reversal did not persist"), 409);
  return c.json(ok({ payment: updated, idempotent: false }), 201);
});
