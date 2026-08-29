import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";

type Bindings = { DB: D1Database; FILES: R2Bucket; APP_ENV: string };
type AppEnv = { Bindings: Bindings };
type Role = "ADMIN" | "USER";
type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED" | "VOID";
type PaymentMethod = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "WALLET";
type SessionUser = { id: string; institutionId: string; email: string; name: string; role: Role; status: "ACTIVE" };

type SubmissionRow = {
  id: string; institutionId: string; userId: string; userName: string; room: string | null; institutionUserId: string | null;
  amountMinor: number; currency: string; method: PaymentMethod; reference: string | null; note: string | null; status: PaymentStatus;
  submittedAt: string; reviewedBy: string | null; reviewedByName: string | null; reviewedAt: string | null; reviewNote: string | null;
  paymentId: string | null; reversalId: string | null;
};
type ProofRow = { id: string; submissionId: string; filename: string; contentType: string; sizeBytes: number; sha256: string; createdAt: string };

type SubmissionDetail = SubmissionRow & { proofs: ProofRow[] };

const SESSION_COOKIE = "boardops_session";
const ok = <T>(data: T) => ({ success: true as const, data });
const fail = (error: string) => ({ success: false as const, error });
const ALLOWED_PROOF_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const MAX_PROOF_SIZE = 5 * 1024 * 1024;
const MAX_PROOFS = 3;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
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

function audit(db: D1Database, actorId: string, action: string, entityId: string, detail: unknown) {
  return db.prepare(`INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail) VALUES (?, ?, ?, 'PaymentSubmission', ?, ?)`)
    .bind(crypto.randomUUID(), actorId, action, entityId, JSON.stringify(detail));
}

function residentNotification(db: D1Database, userId: string, institutionId: string, submissionId: string, title: string, description: string, type: string, priority: string) {
  return db.prepare(`
    INSERT OR IGNORE INTO notifications
      (id, institution_id, user_id, title, description, type, priority, route, source_type, source_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, '/payments', 'PAYMENT_SUBMISSION', ?)
  `).bind(crypto.randomUUID(), institutionId, userId, title, description, type, priority, submissionId);
}

function adminNotification(db: D1Database, institutionId: string, submissionId: string, residentName: string, amountMinor: number) {
  return db.prepare(`
    INSERT OR IGNORE INTO notifications
      (id, institution_id, user_id, title, description, type, priority, route, source_type, source_id)
    SELECT lower(hex(randomblob(16))), ?, u.id, 'New payment submitted', ?, 'INFO', 'HIGH', '/payments', 'PAYMENT_SUBMISSION', ?
    FROM users u
    WHERE u.institution_id = ? AND u.role = 'ADMIN' AND u.status = 'ACTIVE'
  `).bind(institutionId, `${residentName} submitted a payment of ₹${(amountMinor / 100).toFixed(2)} for review.`, submissionId, institutionId);
}

function outbox(db: D1Database, institutionId: string, eventType: string, submissionId: string, payload: unknown) {
  return db.prepare(`
    INSERT OR IGNORE INTO outbox_events
      (id, institution_id, event_type, aggregate_type, aggregate_id, dedupe_key, payload_json)
    VALUES (?, ?, ?, 'PaymentSubmission', ?, ?, ?)
  `).bind(crypto.randomUUID(), institutionId, eventType, submissionId, `${eventType}:${submissionId}`, JSON.stringify(payload));
}

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "proof";
}

function accountingMethod(method: PaymentMethod): "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER" {
  return method === "WALLET" ? "OTHER" : method;
}

async function getSubmission(db: D1Database, institutionId: string, id: string): Promise<SubmissionRow | null> {
  return await db.prepare(`
    SELECT s.id, s.institution_id AS institutionId, s.user_id AS userId, u.name AS userName, u.room,
           u.institution_user_id AS institutionUserId, s.amount_minor AS amountMinor, s.currency, s.method,
           s.reference, s.note, s.status, s.submitted_at AS submittedAt, s.reviewed_by AS reviewedBy,
           reviewer.name AS reviewedByName, s.reviewed_at AS reviewedAt, s.review_note AS reviewNote,
           posting.payment_id AS paymentId, voiding.reversal_id AS reversalId
    FROM payment_submissions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users reviewer ON reviewer.id = s.reviewed_by
    LEFT JOIN payment_posting_links posting ON posting.submission_id = s.id
    LEFT JOIN payment_void_links voiding ON voiding.submission_id = s.id
    WHERE s.id = ? AND s.institution_id = ? LIMIT 1
  `).bind(id, institutionId).first<SubmissionRow>();
}

async function getProofs(db: D1Database, ids: string[]): Promise<ProofRow[]> {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.prepare(`
    SELECT id, submission_id AS submissionId, filename, content_type AS contentType, size_bytes AS sizeBytes, sha256, created_at AS createdAt
    FROM payment_proofs WHERE submission_id IN (${placeholders}) ORDER BY created_at ASC
  `).bind(...ids).all<ProofRow>();
  return result.results;
}

function attachProofs(rows: SubmissionRow[], proofs: ProofRow[]): SubmissionDetail[] {
  const bySubmission = new Map<string, ProofRow[]>();
  for (const proof of proofs) {
    const list = bySubmission.get(proof.submissionId) ?? [];
    list.push(proof);
    bySubmission.set(proof.submissionId, list);
  }
  return rows.map((row) => ({ ...row, proofs: bySubmission.get(row.id) ?? [] }));
}

export const paymentReviewRouter = new Hono<AppEnv>();

paymentReviewRouter.get("/payments", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  const status = c.req.query("status")?.toUpperCase();
  if (status && !["PENDING", "APPROVED", "REJECTED", "VOID"].includes(status)) return c.json(fail("Invalid payment status"), 400);
  const clauses = ["s.institution_id = ?"];
  const bindings: string[] = [user.institutionId];
  if (user.role === "USER") { clauses.push("s.user_id = ?"); bindings.push(user.id); }
  if (status) { clauses.push("s.status = ?"); bindings.push(status); }
  const result = await c.env.DB.prepare(`
    SELECT s.id, s.institution_id AS institutionId, s.user_id AS userId, u.name AS userName, u.room,
           u.institution_user_id AS institutionUserId, s.amount_minor AS amountMinor, s.currency, s.method,
           s.reference, s.note, s.status, s.submitted_at AS submittedAt, s.reviewed_by AS reviewedBy,
           reviewer.name AS reviewedByName, s.reviewed_at AS reviewedAt, s.review_note AS reviewNote,
           posting.payment_id AS paymentId, voiding.reversal_id AS reversalId
    FROM payment_submissions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users reviewer ON reviewer.id = s.reviewed_by
    LEFT JOIN payment_posting_links posting ON posting.submission_id = s.id
    LEFT JOIN payment_void_links voiding ON voiding.submission_id = s.id
    WHERE ${clauses.join(" AND ")}
    ORDER BY CASE s.status WHEN 'PENDING' THEN 0 ELSE 1 END, s.submitted_at DESC, s.id DESC
    LIMIT 500
  `).bind(...bindings).all<SubmissionRow>();
  return c.json(ok({ payments: attachProofs(result.results, await getProofs(c.env.DB, result.results.map((row) => row.id))) }));
});

paymentReviewRouter.post("/payments", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  if (user.role !== "USER") return c.json(fail("Residents submit payments. Administrators review them."), 403);
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) return c.json(fail("Payment submission must include supporting proof files"), 415);

  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json(fail("Invalid payment submission"), 400);
  const amountMinor = Number(form.get("amountMinor"));
  const method = String(form.get("method") ?? "").toUpperCase();
  const reference = String(form.get("reference") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return c.json(fail("Amount must be a positive integer in minor units"), 400);
  if (!["CASH", "UPI", "CARD", "BANK_TRANSFER", "WALLET"].includes(method)) return c.json(fail("Invalid payment method"), 400);
  if (reference.length > 160 || note.length > 500) return c.json(fail("Reference or note is too long"), 400);

  const files = form.getAll("proof").filter((item): item is File => item instanceof File && item.size > 0);
  if (!files.length) return c.json(fail("Attach at least one supporting payment proof"), 400);
  if (files.length > MAX_PROOFS) return c.json(fail(`Attach at most ${MAX_PROOFS} proof files`), 400);
  for (const file of files) {
    if (!ALLOWED_PROOF_TYPES.has(file.type)) return c.json(fail(`Unsupported proof type: ${file.type || "unknown"}`), 400);
    if (file.size > MAX_PROOF_SIZE) return c.json(fail("Each proof file must be 5 MB or smaller"), 400);
  }

  const submissionId = crypto.randomUUID();
  const uploads: Array<{ id: string; key: string; filename: string; contentType: string; size: number; sha: string }> = [];
  try {
    for (const file of files) {
      const proofId = crypto.randomUUID();
      const filename = safeFilename(file.name);
      const key = `payment-proofs/${user.institutionId}/${user.id}/${submissionId}/${proofId}-${filename}`;
      const bytes = await file.arrayBuffer();
      const digest = await sha256(bytes);
      await c.env.FILES.put(key, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { submissionId, proofId, sha256: digest } });
      uploads.push({ id: proofId, key, filename, contentType: file.type, size: file.size, sha: digest });
    }

    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(`
        INSERT INTO payment_submissions
          (id, institution_id, user_id, amount_minor, currency, method, reference, note, status)
        VALUES (?, ?, ?, ?, 'INR', ?, ?, ?, 'PENDING')
      `).bind(submissionId, user.institutionId, user.id, amountMinor, method, reference || null, note || null),
      ...uploads.map((proof) => c.env.DB.prepare(`
        INSERT INTO payment_proofs (id, submission_id, object_key, filename, content_type, size_bytes, sha256)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(proof.id, submissionId, proof.key, proof.filename, proof.contentType, proof.size, proof.sha)),
      adminNotification(c.env.DB, user.institutionId, submissionId, user.name, amountMinor),
      audit(c.env.DB, user.id, "PAYMENT_SUBMITTED", submissionId, { amountMinor, method, reference: reference || null, proofCount: uploads.length }),
      outbox(c.env.DB, user.institutionId, "payment.submitted", submissionId, { submissionId, userId: user.id, amountMinor, method, proofCount: uploads.length }),
    ];
    await c.env.DB.batch(statements);
  } catch (error) {
    await Promise.all(uploads.map((proof) => c.env.FILES.delete(proof.key).catch(() => undefined)));
    console.error("Payment submission failed", error instanceof Error ? error.message : String(error));
    return c.json(fail("Payment could not be submitted safely. No payment was posted."), 409);
  }

  const created = await getSubmission(c.env.DB, user.institutionId, submissionId);
  return c.json(ok({ payment: { ...created!, proofs: await getProofs(c.env.DB, [submissionId]) } }), 201);
});

paymentReviewRouter.get("/payments/:id/proofs/:proofId", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  const row = await c.env.DB.prepare(`
    SELECT p.object_key AS objectKey, p.filename, p.content_type AS contentType, s.user_id AS userId
    FROM payment_proofs p JOIN payment_submissions s ON s.id = p.submission_id
    WHERE p.id = ? AND p.submission_id = ? AND s.institution_id = ? LIMIT 1
  `).bind(c.req.param("proofId"), c.req.param("id"), user.institutionId).first<{ objectKey: string; filename: string; contentType: string; userId: string }>();
  if (!row) return c.json(fail("Payment proof not found"), 404);
  if (user.role !== "ADMIN" && row.userId !== user.id) return c.json(fail("Not allowed to view this payment proof"), 403);
  const object = await c.env.FILES.get(row.objectKey);
  if (!object) return c.json(fail("Payment proof file is unavailable"), 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", row.contentType);
  headers.set("Content-Disposition", `inline; filename=\"${safeFilename(row.filename)}\"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(object.body, { headers });
});

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "VOID"]),
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
});

paymentReviewRouter.patch("/payments/:id/review", async (c) => {
  const admin = await currentUser(c);
  if (!admin) return c.json(fail("Not authenticated"), 401);
  if (admin.role !== "ADMIN") return c.json(fail("Administrator permission required"), 403);
  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail(parsed.error.issues[0]?.message ?? "Invalid payment review"), 400);
  const { action } = parsed.data;
  const reason = parsed.data.reason?.trim() || null;
  if ((action === "REJECT" || action === "VOID") && (!reason || reason.length < 3)) return c.json(fail("Enter a reason of at least 3 characters"), 400);

  const submission = await getSubmission(c.env.DB, admin.institutionId, c.req.param("id"));
  if (!submission) return c.json(fail("Payment submission not found"), 404);

  if (action === "APPROVE") {
    if (submission.status === "APPROVED" && submission.paymentId) return c.json(ok({ payment: submission, idempotent: true }));
    if (submission.status !== "PENDING") return c.json(fail(`Cannot approve a ${submission.status.toLowerCase()} payment`), 409);
    const idempotencyKey = parsed.data.idempotencyKey ?? `approve-${submission.id}`;
    const requestHash = await sha256(JSON.stringify({ action, submissionId: submission.id }));
    const commandId = crypto.randomUUID();
    const paymentId = `approved-${submission.id}`;
    const ledgerId = `ledger-${submission.id}`;
    const existingCommand = await c.env.DB.prepare(`SELECT request_hash AS requestHash, result_entity_id AS resultId FROM accounting_commands WHERE institution_id = ? AND command_type = 'PAYMENT_POST' AND idempotency_key = ? LIMIT 1`).bind(admin.institutionId, idempotencyKey).first<{ requestHash: string; resultId: string }>();
    if (existingCommand && existingCommand.requestHash !== requestHash) return c.json(fail("This idempotency key was already used for a different approval"), 409);
    if (existingCommand) {
      const current = await getSubmission(c.env.DB, admin.institutionId, submission.id);
      return c.json(ok({ payment: current!, idempotent: true }));
    }
    const narrative = `Payment approved: ${submission.method}${submission.reference ? ` · ${submission.reference}` : ""}`;
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO payment_initial_reviews (submission_id, decision, reviewed_by, note) VALUES (?, 'APPROVED', ?, ?)`).bind(submission.id, admin.id, reason),
        c.env.DB.prepare(`INSERT INTO accounting_commands (id, institution_id, command_type, idempotency_key, request_hash, result_entity_id, created_by) VALUES (?, ?, 'PAYMENT_POST', ?, ?, ?, ?)`).bind(commandId, admin.institutionId, idempotencyKey, requestHash, paymentId, admin.id),
        c.env.DB.prepare(`INSERT INTO payments (id, institution_id, user_id, amount_minor, currency, method, reference, note, posted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(paymentId, admin.institutionId, submission.userId, submission.amountMinor, submission.currency, accountingMethod(submission.method), submission.reference, submission.note, admin.id),
        c.env.DB.prepare(`INSERT INTO ledger_entries (id, institution_id, user_id, direction, amount_minor, currency, entry_type, source_type, source_id, command_id, narrative, posted_by) VALUES (?, ?, ?, 'CREDIT', ?, ?, 'PAYMENT', 'PAYMENT', ?, ?, ?, ?)`).bind(ledgerId, admin.institutionId, submission.userId, submission.amountMinor, submission.currency, paymentId, commandId, narrative, admin.id),
        c.env.DB.prepare(`INSERT INTO payment_posting_links (submission_id, payment_id) VALUES (?, ?)`).bind(submission.id, paymentId),
        c.env.DB.prepare(`UPDATE payment_submissions SET status = 'APPROVED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND institution_id = ? AND status = 'PENDING'`).bind(admin.id, reason, submission.id, admin.institutionId),
        residentNotification(c.env.DB, submission.userId, admin.institutionId, submission.id, "Payment approved", `Your payment of ₹${(submission.amountMinor / 100).toFixed(2)} has been approved and credited to your resident fund.`, "SUCCESS", "HIGH"),
        audit(c.env.DB, admin.id, "PAYMENT_APPROVED", submission.id, { amountMinor: submission.amountMinor, paymentId }),
        outbox(c.env.DB, admin.institutionId, "payment.approved", submission.id, { submissionId: submission.id, userId: submission.userId, paymentId, amountMinor: submission.amountMinor }),
      ]);
    } catch (error) {
      console.error("Payment approval failed", submission.id, error instanceof Error ? error.message : String(error));
      return c.json(fail("Payment approval could not be committed safely"), 409);
    }
    return c.json(ok({ payment: (await getSubmission(c.env.DB, admin.institutionId, submission.id))!, idempotent: false }));
  }

  if (action === "REJECT") {
    if (submission.status === "REJECTED") return c.json(ok({ payment: submission, idempotent: true }));
    if (submission.status !== "PENDING") return c.json(fail(`Cannot reject a ${submission.status.toLowerCase()} payment`), 409);
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO payment_initial_reviews (submission_id, decision, reviewed_by, note) VALUES (?, 'REJECTED', ?, ?)`).bind(submission.id, admin.id, reason),
        c.env.DB.prepare(`UPDATE payment_submissions SET status = 'REJECTED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND institution_id = ? AND status = 'PENDING'`).bind(admin.id, reason, submission.id, admin.institutionId),
        residentNotification(c.env.DB, submission.userId, admin.institutionId, submission.id, "Payment rejected", `Your payment of ₹${(submission.amountMinor / 100).toFixed(2)} was rejected: ${reason}`, "WARNING", "HIGH"),
        audit(c.env.DB, admin.id, "PAYMENT_REJECTED", submission.id, { reason }),
        outbox(c.env.DB, admin.institutionId, "payment.rejected", submission.id, { submissionId: submission.id, userId: submission.userId, reason }),
      ]);
    } catch { return c.json(fail("Payment rejection could not be committed safely"), 409); }
    return c.json(ok({ payment: (await getSubmission(c.env.DB, admin.institutionId, submission.id))!, idempotent: false }));
  }

  if (submission.status === "VOID") return c.json(ok({ payment: submission, idempotent: true }));
  if (submission.status === "REJECTED") return c.json(fail("Rejected payments are already terminal"), 409);

  if (submission.status === "PENDING") {
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO payment_initial_reviews (submission_id, decision, reviewed_by, note) VALUES (?, 'VOID', ?, ?)`).bind(submission.id, admin.id, reason),
        c.env.DB.prepare(`UPDATE payment_submissions SET status = 'VOID', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND institution_id = ? AND status = 'PENDING'`).bind(admin.id, reason, submission.id, admin.institutionId),
        residentNotification(c.env.DB, submission.userId, admin.institutionId, submission.id, "Payment voided", `Your pending payment of ₹${(submission.amountMinor / 100).toFixed(2)} was voided: ${reason}`, "WARNING", "HIGH"),
        audit(c.env.DB, admin.id, "PAYMENT_VOIDED", submission.id, { reason, previousStatus: "PENDING" }),
        outbox(c.env.DB, admin.institutionId, "payment.voided", submission.id, { submissionId: submission.id, userId: submission.userId, reason, posted: false }),
      ]);
    } catch { return c.json(fail("Payment void could not be committed safely"), 409); }
    return c.json(ok({ payment: (await getSubmission(c.env.DB, admin.institutionId, submission.id))!, idempotent: false }));
  }

  if (!submission.paymentId) return c.json(fail("Approved payment is missing its accounting posting link"), 409);
  const idempotencyKey = parsed.data.idempotencyKey ?? `void-${submission.id}`;
  const requestHash = await sha256(JSON.stringify({ action: "VOID", submissionId: submission.id, reason }));
  const existingCommand = await c.env.DB.prepare(`SELECT request_hash AS requestHash FROM accounting_commands WHERE institution_id = ? AND command_type = 'PAYMENT_REVERSE' AND idempotency_key = ? LIMIT 1`).bind(admin.institutionId, idempotencyKey).first<{ requestHash: string }>();
  if (existingCommand && existingCommand.requestHash !== requestHash) return c.json(fail("This idempotency key was already used for a different void"), 409);
  if (existingCommand) return c.json(ok({ payment: (await getSubmission(c.env.DB, admin.institutionId, submission.id))!, idempotent: true }));
  const commandId = crypto.randomUUID();
  const reversalId = `void-${submission.id}`;
  const ledgerId = `ledger-void-${submission.id}`;
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO accounting_commands (id, institution_id, command_type, idempotency_key, request_hash, result_entity_id, created_by) VALUES (?, ?, 'PAYMENT_REVERSE', ?, ?, ?, ?)`).bind(commandId, admin.institutionId, idempotencyKey, requestHash, reversalId, admin.id),
      c.env.DB.prepare(`INSERT INTO payment_reversals (id, institution_id, payment_id, reason, reversed_by) VALUES (?, ?, ?, ?, ?)`).bind(reversalId, admin.institutionId, submission.paymentId, reason, admin.id),
      c.env.DB.prepare(`INSERT INTO ledger_entries (id, institution_id, user_id, direction, amount_minor, currency, entry_type, source_type, source_id, command_id, narrative, posted_by) VALUES (?, ?, ?, 'DEBIT', ?, ?, 'PAYMENT_REVERSAL', 'PAYMENT_REVERSAL', ?, ?, ?, ?)`).bind(ledgerId, admin.institutionId, submission.userId, submission.amountMinor, submission.currency, reversalId, commandId, `Payment voided: ${reason}`, admin.id),
      c.env.DB.prepare(`INSERT INTO payment_void_links (submission_id, reversal_id) VALUES (?, ?)`).bind(submission.id, reversalId),
      c.env.DB.prepare(`UPDATE payment_submissions SET status = 'VOID', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND institution_id = ? AND status = 'APPROVED'`).bind(admin.id, reason, submission.id, admin.institutionId),
      residentNotification(c.env.DB, submission.userId, admin.institutionId, submission.id, "Payment voided", `Your approved payment of ₹${(submission.amountMinor / 100).toFixed(2)} was voided with a compensating ledger debit: ${reason}`, "WARNING", "HIGH"),
      audit(c.env.DB, admin.id, "PAYMENT_VOIDED", submission.id, { reason, previousStatus: "APPROVED", reversalId }),
      outbox(c.env.DB, admin.institutionId, "payment.voided", submission.id, { submissionId: submission.id, userId: submission.userId, reversalId, amountMinor: submission.amountMinor }),
    ]);
  } catch (error) {
    console.error("Approved payment void failed", submission.id, error instanceof Error ? error.message : String(error));
    return c.json(fail("Payment void could not be committed safely"), 409);
  }
  return c.json(ok({ payment: (await getSubmission(c.env.DB, admin.institutionId, submission.id))!, idempotent: false }));
});

paymentReviewRouter.post("/payments/:id/reverse", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json(fail("Not authenticated"), 401);
  return c.json(fail("Direct payment reversal is disabled. Administrators must use the payment review VOID action so product state and ledger state stay synchronized."), 410);
});
