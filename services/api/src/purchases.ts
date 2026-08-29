import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";

type Bindings = { DB: D1Database; FILES: R2Bucket; APP_ENV: string };
type AppEnv = { Bindings: Bindings };
type Role = "ADMIN" | "USER";
type SessionUser = { id: string; institutionId: string; email: string; name: string; role: Role; status: "ACTIVE" };
type UnitCategory = "WEIGHT" | "VOLUME" | "QUANTITY" | "OTHER";

type UnitRow = { id: string; name: string; category: UnitCategory; isActive: number; createdAt: string; updatedAt: string };
type ProductRow = {
  id: string; name: string; slug: string; category: string; defaultUnitId: string | null; isActive: number; archivedAt: string | null;
  createdAt: string; updatedAt: string; unitId: string | null; unitName: string | null; unitCategory: UnitCategory | null; unitActive: number | null;
};
type PurchaseRow = {
  id: string; institutionId: string; vendor: string; purchaseDate: string; totalAmountMinor: number; currency: string; notes: string | null;
  expenseId: string; createdBy: string; createdByName: string; createdAt: string; lastAction: "RECORDED" | "VOIDED" | "RESTORED" | null;
  lastReason: string | null; lastActionAt: string | null;
};
type PurchaseItemRow = {
  id: string; purchaseId: string; productId: string | null; productName: string; category: string; quantityMilli: number; unit: string;
  rateMinor: number; totalMinor: number; notes: string | null;
};

const SESSION_COOKIE = "boardops_session";
const ok = <T>(data: T) => ({ success: true as const, data });
const fail = (error: string) => ({ success: false as const, error });
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

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
  return await c.env.DB.prepare(`
    SELECT u.id, u.institution_id AS institutionId, u.email, u.name, u.role, u.status
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.status = 'ACTIVE'
    LIMIT 1
  `).bind(await sha256(token)).first<SessionUser>();
}

function audit(db: D1Database, actorId: string, action: string, entityType: string, entityId: string, detail: unknown) {
  return db.prepare(`INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), actorId, action, entityType, entityId, JSON.stringify(detail));
}

function slugify(value: string): string {
  const slug = value.toLowerCase().trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `product-${crypto.randomUUID().slice(0, 8)}`;
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, end };
}

function dateInTimezone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function productShape(row: ProductRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    defaultUnitId: row.defaultUnitId,
    isActive: Boolean(row.isActive),
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    defaultUnit: row.unitId ? { id: row.unitId, name: row.unitName!, category: row.unitCategory!, isActive: Boolean(row.unitActive) } : null,
  };
}

function unitShape(row: UnitRow) {
  return { ...row, isActive: Boolean(row.isActive) };
}

function purchaseShape(row: PurchaseRow, items: PurchaseItemRow[]) {
  const deleted = row.lastAction === "VOIDED";
  return {
    id: row.id,
    vendor: row.vendor,
    purchaseDate: row.purchaseDate,
    totalAmountMinor: row.totalAmountMinor,
    currency: row.currency,
    notes: row.notes,
    expenseId: row.expenseId,
    status: deleted ? "DELETED" as const : "APPROVED" as const,
    deletedAt: deleted ? row.lastActionAt : null,
    deletionReason: deleted ? row.lastReason : null,
    createdBy: row.createdBy,
    user: { id: row.createdBy, name: row.createdByName },
    createdAt: row.createdAt,
    items,
  };
}

const productSelect = `
  SELECT p.id, p.name, p.slug, p.category, p.default_unit_id AS defaultUnitId, p.is_active AS isActive,
         p.archived_at AS archivedAt, p.created_at AS createdAt, p.updated_at AS updatedAt,
         u.id AS unitId, u.name AS unitName, u.category AS unitCategory, u.is_active AS unitActive
  FROM products p LEFT JOIN units u ON u.id = p.default_unit_id
`;

const purchaseSelect = `
  SELECT p.id, p.institution_id AS institutionId, p.vendor, p.purchase_date AS purchaseDate,
         p.total_amount_minor AS totalAmountMinor, p.currency, p.notes, p.expense_id AS expenseId,
         p.created_by AS createdBy, creator.name AS createdByName, p.created_at AS createdAt,
         (SELECT pe.action FROM purchase_events pe WHERE pe.purchase_id = p.id ORDER BY pe.sequence DESC LIMIT 1) AS lastAction,
         (SELECT pe.reason FROM purchase_events pe WHERE pe.purchase_id = p.id ORDER BY pe.sequence DESC LIMIT 1) AS lastReason,
         (SELECT pe.created_at FROM purchase_events pe WHERE pe.purchase_id = p.id ORDER BY pe.sequence DESC LIMIT 1) AS lastActionAt
  FROM purchases p JOIN users creator ON creator.id = p.created_by
`;

async function loadItems(db: D1Database, purchaseIds: string[]): Promise<PurchaseItemRow[]> {
  if (!purchaseIds.length) return [];
  const placeholders = purchaseIds.map(() => "?").join(",");
  const result = await db.prepare(`
    SELECT id, purchase_id AS purchaseId, product_id AS productId, product_name AS productName, category,
           quantity_milli AS quantityMilli, unit, rate_minor AS rateMinor, total_minor AS totalMinor, notes
    FROM purchase_items WHERE purchase_id IN (${placeholders}) ORDER BY created_at ASC, id ASC
  `).bind(...purchaseIds).all<PurchaseItemRow>();
  return result.results;
}

async function loadPurchase(db: D1Database, institutionId: string, id: string) {
  const row = await db.prepare(`${purchaseSelect} WHERE p.id = ? AND p.institution_id = ? LIMIT 1`).bind(id, institutionId).first<PurchaseRow>();
  if (!row) return null;
  return purchaseShape(row, await loadItems(db, [id]));
}

export const purchaseRouter = new Hono<AppEnv>();

purchaseRouter.get("/units", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  const result = await c.env.DB.prepare(`
    SELECT id, name, category, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
    FROM units WHERE institution_id = ? ORDER BY category ASC, name ASC
  `).bind(user.institutionId).all<UnitRow>();
  return c.json(ok(result.results.map(unitShape)));
});

const unitCreateSchema = z.object({
  name: z.string().trim().min(1).max(20),
  category: z.enum(["WEIGHT", "VOLUME", "QUANTITY", "OTHER"]).default("QUANTITY"),
  isActive: z.boolean().default(true),
});

purchaseRouter.post("/units", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = unitCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail("Invalid unit data"), 400);
  const existing = await c.env.DB.prepare(`SELECT id FROM units WHERE institution_id = ? AND name = ? COLLATE NOCASE LIMIT 1`).bind(admin.institutionId, parsed.data.name).first<{ id: string }>();
  if (existing) return c.json(fail("A unit with this name already exists"), 409);
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO units (id, institution_id, name, category, is_active) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, admin.institutionId, parsed.data.name, parsed.data.category, parsed.data.isActive ? 1 : 0),
    audit(c.env.DB, admin.id, "UNIT_CREATE", "Unit", id, parsed.data),
  ]);
  const row = await c.env.DB.prepare(`SELECT id, name, category, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM units WHERE id = ?`).bind(id).first<UnitRow>();
  return c.json(ok(unitShape(row!)), 201);
});

const unitUpdateSchema = z.object({
  category: z.enum(["WEIGHT", "VOLUME", "QUANTITY", "OTHER"]).optional(),
  isActive: z.boolean().optional(),
});

purchaseRouter.patch("/units/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = unitUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return c.json(fail("No unit changes supplied"), 400);
  const existing = await c.env.DB.prepare(`SELECT id, name, category, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM units WHERE id = ? AND institution_id = ?`).bind(c.req.param("id"), admin.institutionId).first<UnitRow>();
  if (!existing) return c.json(fail("Unit not found"), 404);
  const category = parsed.data.category ?? existing.category;
  const isActive = parsed.data.isActive ?? Boolean(existing.isActive);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE units SET category = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(category, isActive ? 1 : 0, existing.id),
    audit(c.env.DB, admin.id, "UNIT_UPDATE", "Unit", existing.id, { from: unitShape(existing), to: { category, isActive } }),
  ]);
  const row = await c.env.DB.prepare(`SELECT id, name, category, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM units WHERE id = ?`).bind(existing.id).first<UnitRow>();
  return c.json(ok(unitShape(row!)));
});

purchaseRouter.delete("/units/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const existing = await c.env.DB.prepare(`SELECT id, name, category, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM units WHERE id = ? AND institution_id = ?`).bind(c.req.param("id"), admin.institutionId).first<UnitRow>();
  if (!existing) return c.json(fail("Unit not found"), 404);
  const usage = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM products WHERE institution_id = ? AND default_unit_id = ?`).bind(admin.institutionId, existing.id).first<{ count: number }>();
  if ((usage?.count ?? 0) > 0) return c.json(fail(`Cannot delete: ${usage!.count} product(s) use this unit as their default. Reassign them first.`), 409);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE units SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(existing.id),
    audit(c.env.DB, admin.id, "UNIT_DEACTIVATE", "Unit", existing.id, { name: existing.name }),
  ]);
  return c.json(ok({ ...unitShape(existing), isActive: false }));
});

purchaseRouter.get("/products", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  const includeArchived = c.req.query("includeArchived") === "true";
  const category = c.req.query("category")?.trim();
  const clauses = ["p.institution_id = ?"];
  const bindings: Array<string | number> = [user.institutionId];
  if (!includeArchived) clauses.push("p.is_active = 1");
  if (category) { clauses.push("p.category = ?"); bindings.push(category); }
  const result = await c.env.DB.prepare(`${productSelect} WHERE ${clauses.join(" AND ")} ORDER BY p.category ASC, p.name ASC`).bind(...bindings).all<ProductRow>();
  return c.json(ok(result.results.map(productShape)));
});

const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(60).default("GENERAL"),
  defaultUnitId: z.string().trim().min(1).nullable().optional(),
});

purchaseRouter.post("/products", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = productCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail("Invalid product data"), 400);
  const slug = slugify(parsed.data.name);
  const existing = await c.env.DB.prepare(`SELECT id FROM products WHERE institution_id = ? AND (name = ? COLLATE NOCASE OR slug = ?) LIMIT 1`).bind(admin.institutionId, parsed.data.name, slug).first<{ id: string }>();
  if (existing) return c.json(fail("A product with this name already exists"), 409);
  if (parsed.data.defaultUnitId) {
    const unit = await c.env.DB.prepare(`SELECT id FROM units WHERE id = ? AND institution_id = ? LIMIT 1`).bind(parsed.data.defaultUnitId, admin.institutionId).first<{ id: string }>();
    if (!unit) return c.json(fail("Default unit not found"), 404);
  }
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO products (id, institution_id, name, slug, category, default_unit_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, admin.institutionId, parsed.data.name, slug, parsed.data.category, parsed.data.defaultUnitId ?? null),
    audit(c.env.DB, admin.id, "PRODUCT_CREATE", "Product", id, parsed.data),
  ]);
  const row = await c.env.DB.prepare(`${productSelect} WHERE p.id = ?`).bind(id).first<ProductRow>();
  return c.json(ok(productShape(row!)), 201);
});

const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  defaultUnitId: z.string().trim().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
});

purchaseRouter.patch("/products/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = productUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return c.json(fail("No product changes supplied"), 400);
  const current = await c.env.DB.prepare(`${productSelect} WHERE p.id = ? AND p.institution_id = ?`).bind(c.req.param("id"), admin.institutionId).first<ProductRow>();
  if (!current) return c.json(fail("Product not found"), 404);
  const name = parsed.data.name ?? current.name;
  const slug = parsed.data.name ? slugify(parsed.data.name) : current.slug;
  const category = parsed.data.category ?? current.category;
  const defaultUnitId = parsed.data.defaultUnitId !== undefined ? parsed.data.defaultUnitId : current.defaultUnitId;
  const isActive = parsed.data.isActive ?? Boolean(current.isActive);
  if (defaultUnitId) {
    const unit = await c.env.DB.prepare(`SELECT id FROM units WHERE id = ? AND institution_id = ? LIMIT 1`).bind(defaultUnitId, admin.institutionId).first<{ id: string }>();
    if (!unit) return c.json(fail("Default unit not found"), 404);
  }
  const duplicate = await c.env.DB.prepare(`SELECT id FROM products WHERE institution_id = ? AND id <> ? AND (name = ? COLLATE NOCASE OR slug = ?) LIMIT 1`).bind(admin.institutionId, current.id, name, slug).first<{ id: string }>();
  if (duplicate) return c.json(fail("A product with this name already exists"), 409);
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE products SET name = ?, slug = ?, category = ?, default_unit_id = ?, is_active = ?,
        archived_at = CASE WHEN ? = 0 THEN COALESCE(archived_at, CURRENT_TIMESTAMP) ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(name, slug, category, defaultUnitId, isActive ? 1 : 0, isActive ? 1 : 0, current.id),
    audit(c.env.DB, admin.id, "PRODUCT_UPDATE", "Product", current.id, { from: productShape(current), to: { name, category, defaultUnitId, isActive } }),
  ]);
  const row = await c.env.DB.prepare(`${productSelect} WHERE p.id = ?`).bind(current.id).first<ProductRow>();
  return c.json(ok(productShape(row!)));
});

purchaseRouter.delete("/products/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const current = await c.env.DB.prepare(`${productSelect} WHERE p.id = ? AND p.institution_id = ?`).bind(c.req.param("id"), admin.institutionId).first<ProductRow>();
  if (!current) return c.json(fail("Product not found"), 404);
  const usage = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM purchase_items WHERE product_id = ?`).bind(current.id).first<{ count: number }>();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE products SET is_active = 0, archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(current.id),
    audit(c.env.DB, admin.id, "PRODUCT_ARCHIVE", "Product", current.id, { name: current.name, usageCount: usage?.count ?? 0, safety: "archived-not-hard-deleted" }),
  ]);
  return c.json(ok({ archived: true, usageCount: usage?.count ?? 0 }));
});

const purchaseItemSchema = z.object({
  productId: z.string().trim().min(1).nullable().optional(),
  productName: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60).default("GENERAL"),
  quantityMilli: z.number().int().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(20),
  rateMinor: z.number().int().min(0).max(1_000_000_000),
  notes: z.string().trim().max(500).nullable().optional(),
});

const purchaseCreateSchema = z.object({
  vendor: z.string().trim().min(1).max(200),
  purchaseDate: z.string().trim(),
  items: z.array(purchaseItemSchema).min(1).max(50),
  notes: z.string().trim().max(1000).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(160),
});

purchaseRouter.get("/purchases", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const includeDeleted = c.req.query("includeDeleted") === "true";
  const monthRaw = c.req.query("month");
  const yearRaw = c.req.query("year");
  const limit = Math.max(1, Math.min(500, Number(c.req.query("limit") ?? 100) || 100));
  const clauses = ["p.institution_id = ?"];
  const bindings: Array<string | number> = [admin.institutionId];
  if (monthRaw || yearRaw) {
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2200) return c.json(fail("Invalid month or year"), 400);
    const range = monthRange(year, month);
    clauses.push("p.purchase_date >= ?", "p.purchase_date < ?");
    bindings.push(range.start, range.end);
  }
  if (!includeDeleted) clauses.push("COALESCE((SELECT pe.action FROM purchase_events pe WHERE pe.purchase_id = p.id ORDER BY pe.sequence DESC LIMIT 1), 'RECORDED') <> 'VOIDED'");
  bindings.push(limit);
  const result = await c.env.DB.prepare(`${purchaseSelect} WHERE ${clauses.join(" AND ")} ORDER BY p.purchase_date DESC, p.created_at DESC LIMIT ?`).bind(...bindings).all<PurchaseRow>();
  const items = await loadItems(c.env.DB, result.results.map((row) => row.id));
  const byPurchase = new Map<string, PurchaseItemRow[]>();
  for (const item of items) {
    const list = byPurchase.get(item.purchaseId) ?? [];
    list.push(item); byPurchase.set(item.purchaseId, list);
  }
  return c.json(ok(result.results.map((row) => purchaseShape(row, byPurchase.get(row.id) ?? []))));
});

purchaseRouter.get("/purchases/stats", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const now = new Date();
  const month = Number(c.req.query("month") ?? now.getUTCMonth() + 1);
  const year = Number(c.req.query("year") ?? now.getUTCFullYear());
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2200) return c.json(fail("Invalid month or year"), 400);
  const { start, end } = monthRange(year, month);
  const institution = await c.env.DB.prepare(`SELECT timezone FROM institutions WHERE id = ?`).bind(admin.institutionId).first<{ timezone: string }>();
  const today = dateInTimezone(institution?.timezone || "Asia/Kolkata");
  const active = "COALESCE((SELECT pe.action FROM purchase_events pe WHERE pe.purchase_id = p.id ORDER BY pe.sequence DESC LIMIT 1), 'RECORDED') <> 'VOIDED'";
  const totals = await c.env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN p.purchase_date = ? THEN p.total_amount_minor ELSE 0 END), 0) AS todayTotalMinor,
      COALESCE(SUM(p.total_amount_minor), 0) AS monthTotalMinor,
      COUNT(*) AS monthCount
    FROM purchases p WHERE p.institution_id = ? AND p.purchase_date >= ? AND p.purchase_date < ? AND ${active}
  `).bind(today, admin.institutionId, start, end).first<{ todayTotalMinor: number; monthTotalMinor: number; monthCount: number }>();
  const products = await c.env.DB.prepare(`
    SELECT pi.product_name AS name, COALESCE(SUM(pi.total_minor), 0) AS totalSpendMinor, COALESCE(SUM(pi.quantity_milli), 0) AS totalQuantityMilli
    FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
    WHERE p.institution_id = ? AND p.purchase_date >= ? AND p.purchase_date < ? AND ${active}
    GROUP BY pi.product_name ORDER BY totalSpendMinor DESC, pi.product_name ASC LIMIT 5
  `).bind(admin.institutionId, start, end).all<{ name: string; totalSpendMinor: number; totalQuantityMilli: number }>();
  const categories = await c.env.DB.prepare(`
    SELECT pi.category, COALESCE(SUM(pi.total_minor), 0) AS totalSpendMinor
    FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
    WHERE p.institution_id = ? AND p.purchase_date >= ? AND p.purchase_date < ? AND ${active}
    GROUP BY pi.category ORDER BY totalSpendMinor DESC, pi.category ASC LIMIT 5
  `).bind(admin.institutionId, start, end).all<{ category: string; totalSpendMinor: number }>();
  return c.json(ok({
    todayTotalMinor: totals?.todayTotalMinor ?? 0,
    monthTotalMinor: totals?.monthTotalMinor ?? 0,
    monthCount: totals?.monthCount ?? 0,
    topProducts: products.results,
    topCategories: categories.results,
  }));
});

purchaseRouter.post("/purchases", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = purchaseCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail("Invalid purchase data"), 400);
  if (!validIsoDate(parsed.data.purchaseDate)) return c.json(fail("Invalid purchase date"), 400);
  const requestHash = await sha256(JSON.stringify(parsed.data));
  const prior = await c.env.DB.prepare(`SELECT id, request_hash AS requestHash FROM purchases WHERE institution_id = ? AND idempotency_key = ? LIMIT 1`).bind(admin.institutionId, parsed.data.idempotencyKey).first<{ id: string; requestHash: string }>();
  if (prior) {
    if (prior.requestHash !== requestHash) return c.json(fail("Idempotency key was already used for a different purchase"), 409);
    return c.json(ok({ purchase: await loadPurchase(c.env.DB, admin.institutionId, prior.id), idempotent: true }));
  }

  const resolvedItems: Array<{ id: string; productId: string | null; productName: string; category: string; quantityMilli: number; unit: string; rateMinor: number; totalMinor: number; notes: string | null }> = [];
  let totalAmount = 0n;
  for (const input of parsed.data.items) {
    let productName = input.productName;
    let category = input.category;
    if (input.productId) {
      const product = await c.env.DB.prepare(`SELECT id, name, category, is_active AS isActive FROM products WHERE id = ? AND institution_id = ? LIMIT 1`).bind(input.productId, admin.institutionId).first<{ id: string; name: string; category: string; isActive: number }>();
      if (!product) return c.json(fail(`Product not found: ${input.productName}`), 404);
      if (!product.isActive) return c.json(fail(`Product is archived: ${product.name}`), 409);
      productName = product.name;
      category = product.category;
    }
    const itemTotal = (BigInt(input.quantityMilli) * BigInt(input.rateMinor) + 500n) / 1000n;
    if (itemTotal > MAX_SAFE) return c.json(fail("Purchase item total is too large"), 400);
    totalAmount += itemTotal;
    if (totalAmount > MAX_SAFE) return c.json(fail("Purchase total is too large"), 400);
    resolvedItems.push({
      id: crypto.randomUUID(), productId: input.productId ?? null, productName, category,
      quantityMilli: input.quantityMilli, unit: input.unit, rateMinor: input.rateMinor, totalMinor: Number(itemTotal), notes: input.notes ?? null,
    });
  }

  const purchaseId = crypto.randomUUID();
  const expenseId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`
      INSERT INTO expenses
        (id, institution_id, title, description, category, quantity_milli, unit, amount_minor, currency, expense_date, paid_to, source_type, source_id, created_by)
      VALUES (?, ?, ?, ?, 'PURCHASE', 1000, 'purchase', ?, 'INR', ?, ?, 'PURCHASE', ?, ?)
    `).bind(expenseId, admin.institutionId, `Purchase: ${parsed.data.vendor}`, parsed.data.notes || `${resolvedItems.length} item(s) from ${parsed.data.vendor}`, Number(totalAmount), parsed.data.purchaseDate, parsed.data.vendor, purchaseId, admin.id),
    c.env.DB.prepare(`
      INSERT INTO purchases
        (id, institution_id, vendor, purchase_date, total_amount_minor, currency, notes, expense_id, idempotency_key, request_hash, created_by)
      VALUES (?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?)
    `).bind(purchaseId, admin.institutionId, parsed.data.vendor, parsed.data.purchaseDate, Number(totalAmount), parsed.data.notes ?? null, expenseId, parsed.data.idempotencyKey, requestHash, admin.id),
    ...resolvedItems.map((item) => c.env.DB.prepare(`
      INSERT INTO purchase_items
        (id, purchase_id, product_id, product_name, category, quantity_milli, unit, rate_minor, total_minor, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(item.id, purchaseId, item.productId, item.productName, item.category, item.quantityMilli, item.unit, item.rateMinor, item.totalMinor, item.notes)),
    c.env.DB.prepare(`INSERT INTO purchase_events (id, purchase_id, action, reason, idempotency_key, actor_user_id) VALUES (?, ?, 'RECORDED', ?, ?, ?)`)
      .bind(crypto.randomUUID(), purchaseId, "Purchase recorded", `purchase-record:${purchaseId}`, admin.id),
    c.env.DB.prepare(`INSERT INTO expense_events (id, expense_id, action, reason, idempotency_key, actor_user_id) VALUES (?, ?, 'RECORDED', ?, ?, ?)`)
      .bind(crypto.randomUUID(), expenseId, "Created from purchase", `expense-record:${expenseId}`, admin.id),
    audit(c.env.DB, admin.id, "PURCHASE_CREATE", "Purchase", purchaseId, { vendor: parsed.data.vendor, totalAmountMinor: Number(totalAmount), itemCount: resolvedItems.length, expenseId }),
  ];

  try {
    await c.env.DB.batch(statements);
  } catch (error) {
    const raced = await c.env.DB.prepare(`SELECT id, request_hash AS requestHash FROM purchases WHERE institution_id = ? AND idempotency_key = ? LIMIT 1`).bind(admin.institutionId, parsed.data.idempotencyKey).first<{ id: string; requestHash: string }>();
    if (raced?.requestHash === requestHash) return c.json(ok({ purchase: await loadPurchase(c.env.DB, admin.institutionId, raced.id), idempotent: true }));
    console.error("Purchase create failed", error instanceof Error ? error.message : String(error));
    return c.json(fail("Purchase could not be recorded safely"), 409);
  }

  return c.json(ok({ purchase: await loadPurchase(c.env.DB, admin.institutionId, purchaseId), idempotent: false }), 201);
});

purchaseRouter.get("/purchases/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const purchase = await loadPurchase(c.env.DB, admin.institutionId, c.req.param("id"));
  if (!purchase) return c.json(fail("Purchase not found"), 404);
  return c.json(ok(purchase));
});

const purchaseActionSchema = z.object({
  action: z.enum(["SOFT_DELETE", "RESTORE"]),
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
});

purchaseRouter.patch("/purchases/:id", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = purchaseActionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail("Invalid purchase action"), 400);
  const purchaseId = c.req.param("id");
  const purchase = await loadPurchase(c.env.DB, admin.institutionId, purchaseId);
  if (!purchase) return c.json(fail("Purchase not found"), 404);
  if (parsed.data.action === "SOFT_DELETE" && (!parsed.data.reason || parsed.data.reason.length < 3)) return c.json(fail("Deletion reason is required"), 400);
  const idempotencyKey = parsed.data.idempotencyKey ?? `purchase-action:${crypto.randomUUID()}`;
  const prior = await c.env.DB.prepare(`SELECT id FROM purchase_events WHERE idempotency_key = ? LIMIT 1`).bind(idempotencyKey).first<{ id: string }>();
  if (prior) return c.json(ok({ purchase: await loadPurchase(c.env.DB, admin.institutionId, purchaseId), idempotent: true, changed: false }));

  const current = await c.env.DB.prepare(`SELECT action FROM purchase_events WHERE purchase_id = ? ORDER BY sequence DESC LIMIT 1`).bind(purchaseId).first<{ action: "RECORDED" | "VOIDED" | "RESTORED" }>();
  const nextAction = parsed.data.action === "SOFT_DELETE" ? "VOIDED" as const : "RESTORED" as const;
  if (nextAction === "VOIDED" && current?.action === "VOIDED") return c.json(ok({ purchase, idempotent: true, changed: false }));
  if (nextAction === "RESTORED" && current?.action !== "VOIDED") return c.json(fail("Only a deleted purchase can be restored"), 409);

  const expenseId = purchase.expenseId;
  const reason = parsed.data.action === "SOFT_DELETE" ? parsed.data.reason! : "Purchase restored";
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO purchase_events (id, purchase_id, action, reason, idempotency_key, actor_user_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), purchaseId, nextAction, reason, idempotencyKey, admin.id),
    c.env.DB.prepare(`INSERT INTO expense_events (id, expense_id, action, reason, idempotency_key, actor_user_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), expenseId, nextAction, reason, `expense:${idempotencyKey}`, admin.id),
    audit(c.env.DB, admin.id, parsed.data.action === "SOFT_DELETE" ? "PURCHASE_SOFT_DELETE" : "PURCHASE_RESTORE", "Purchase", purchaseId, { reason, safety: "append-only-event" }),
  ]);
  return c.json(ok({ purchase: await loadPurchase(c.env.DB, admin.institutionId, purchaseId), idempotent: false, changed: true }));
});
