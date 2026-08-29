import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, CircleX, ExternalLink, FileCheck2, History, RefreshCw, ShieldCheck, Upload, UserRound, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "../../lib/api";
import "./payments.css";

type Role = "ADMIN" | "USER";
type Viewer = { id: string; name: string; role: Role; room: string | null };
type Method = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "WALLET";
type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED" | "VOID";

type Proof = { id: string; submissionId: string; filename: string; contentType: string; sizeBytes: number; sha256: string; createdAt: string };
type Payment = {
  id: string; userId: string; userName: string; room: string | null; institutionUserId: string | null;
  amountMinor: number; currency: string; method: Method; reference: string | null; note: string | null; status: PaymentStatus;
  submittedAt: string; reviewedBy: string | null; reviewedByName: string | null; reviewedAt: string | null; reviewNote: string | null;
  paymentId: string | null; reversalId: string | null; proofs: Proof[];
};
type BalanceRow = { userId: string; name: string; room: string | null; institutionUserId: string | null; balanceMinor: number };
type LedgerEntry = { id: string; direction: "CREDIT" | "DEBIT"; amountMinor: number; currency: string; entryType: string; sourceType: string; sourceId: string; narrative: string; postedByName: string; postedAt: string };
type LedgerData = { resident: { id: string; name: string; room: string | null; institutionUserId: string | null }; balanceMinor: number; currency: string; entries: LedgerEntry[] };

const methods: Array<{ value: Method; label: string }> = [
  { value: "UPI", label: "UPI" }, { value: "BANK_TRANSFER", label: "Bank transfer" }, { value: "CASH", label: "Cash" }, { value: "CARD", label: "Card" }, { value: "WALLET", label: "Wallet" },
];

function formatMoney(amountMinor: number, currency = "INR") {
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  const major = Math.trunc(absolute / 100);
  const minor = String(absolute % 100).padStart(2, "0");
  return `${sign}${currency === "INR" ? "₹" : `${currency} `}${major.toLocaleString("en-IN")}.${minor}`;
}

function parseMajorToMinor(value: string): number | null {
  const normalized = value.trim().replaceAll(",", "");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [major = "0", fraction = ""] = normalized.split(".");
  try {
    const amount = BigInt(major) * 100n + BigInt((fraction + "00").slice(0, 2));
    return amount > 0n && amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
  } catch { return null; }
}

function timeLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function fileSize(value: number) { return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`; }
function paymentMethod(value: Method) { return methods.find((item) => item.value === value)?.label ?? value; }

function PaymentsError({ message, retry }: { message: string; retry: () => void }) {
  return <section className="payments-error glass-surface"><ShieldCheck size={26} /><strong>Couldn’t load payments</strong><span>{message}</span><button onClick={retry}><RefreshCw size={15} /> Try again</button></section>;
}

export function PaymentsPage({ user }: { user: Viewer }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("UPI");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [proofs, setProofs] = useState<File[]>([]);
  const [fileKey, setFileKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"ALL" | PaymentStatus>("ALL");
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});

  const payments = useQuery({ queryKey: ["payment-submissions", statusFilter], queryFn: () => apiRequest<{ payments: Payment[] }>(`/payments${statusFilter === "ALL" ? "" : `?status=${statusFilter}`}`) });
  const adminSummary = useQuery({ queryKey: ["funds-summary", "admin"], queryFn: () => apiRequest<{ currency: string; balances: BalanceRow[] }>("/funds/summary"), enabled: user.role === "ADMIN" });
  const residentSummary = useQuery({ queryKey: ["funds-summary", "resident"], queryFn: () => apiRequest<{ currency: string; balanceMinor: number }>("/funds/summary"), enabled: user.role === "USER" });
  const ledger = useQuery({ queryKey: ["fund-ledger"], queryFn: () => apiRequest<LedgerData>("/funds/ledger"), enabled: user.role === "USER" });

  const invalidateFinancial = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["payment-submissions"] }), queryClient.invalidateQueries({ queryKey: ["funds-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["fund-ledger"] }), queryClient.invalidateQueries({ queryKey: ["notifications"] }), queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  };

  const submitPayment = useMutation({
    mutationFn: (form: FormData) => apiRequest<{ payment: Payment }>("/payments", { method: "POST", body: form }),
    onSuccess: async () => {
      toast.success("Payment submitted — pending admin approval");
      setAmount(""); setReference(""); setNote(""); setProofs([]); setFileKey((value) => value + 1);
      await invalidateFinancial();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reviewPayment = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: "APPROVE" | "REJECT" | "VOID"; reason?: string }) => apiRequest<{ payment: Payment; idempotent: boolean }>(`/payments/${id}/review`, {
      method: "PATCH",
      body: JSON.stringify({ action, ...(reason ? { reason } : {}), idempotencyKey: `web-${action.toLowerCase()}-${crypto.randomUUID()}` }),
    }),
    onSuccess: async ({ payment, idempotent }) => {
      toast.success(idempotent ? `Payment already ${payment.status.toLowerCase()}` : `Payment ${payment.status.toLowerCase()}`);
      setReviewReasons((reasons) => ({ ...reasons, [payment.id]: "" }));
      await invalidateFinancial();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = payments.data?.payments ?? [];
  const counts = useMemo(() => ({
    pending: rows.filter((item) => item.status === "PENDING").length,
    approved: rows.filter((item) => item.status === "APPROVED").length,
    rejected: rows.filter((item) => item.status === "REJECTED").length,
    void: rows.filter((item) => item.status === "VOID").length,
  }), [rows]);
  const adminBalances = adminSummary.data?.balances ?? [];
  const totalFunds = useMemo(() => adminBalances.reduce((sum, item) => sum + item.balanceMinor, 0), [adminBalances]);
  const residentBalance = residentSummary.data?.balanceMinor ?? 0;
  const summaryError = user.role === "ADMIN" ? adminSummary.error : residentSummary.error;
  const loading = payments.isLoading || (user.role === "ADMIN" ? adminSummary.isLoading : residentSummary.isLoading || ledger.isLoading);
  const error = payments.error || summaryError || (user.role === "USER" ? ledger.error : null);

  const submit = () => {
    const amountMinor = parseMajorToMinor(amount);
    if (!amountMinor) return toast.error("Enter a valid positive amount with at most 2 decimal places");
    if (!proofs.length) return toast.error("Attach at least one payment proof");
    if (proofs.length > 3) return toast.error("Attach at most 3 proof files");
    if (proofs.some((file) => file.size > 5 * 1024 * 1024)) return toast.error("Each proof must be 5 MB or smaller");
    const form = new FormData();
    form.set("amountMinor", String(amountMinor)); form.set("method", method); form.set("reference", reference.trim()); form.set("note", note.trim());
    proofs.forEach((file) => form.append("proof", file));
    submitPayment.mutate(form);
  };

  const act = (payment: Payment, action: "APPROVE" | "REJECT" | "VOID") => {
    const reason = reviewReasons[payment.id]?.trim() ?? "";
    if ((action === "REJECT" || action === "VOID") && reason.length < 3) return toast.error("Enter an admin reason of at least 3 characters");
    reviewPayment.mutate({ id: payment.id, action, ...(reason ? { reason } : {}) });
  };

  return <motion.div className="page-stack payments-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <section className="page-heading payments-heading"><div><span className="eyebrow">PAYMENT REVIEW</span><h1>Payments & resident fund</h1><p>{user.role === "USER" ? "Submit your payment with supporting proof. Your balance changes only after an administrator approves it." : "Review resident-submitted payments and their proofs. Approval is the only path that credits the resident ledger."}</p></div><div className="accounting-safety"><ShieldCheck size={18} /><div><span>Workflow</span><strong>Submit → Review → Ledger</strong></div></div></section>

    {loading ? <div className="payments-skeleton-grid"><div className="skeleton kpi" /><div className="skeleton kpi" /><div className="skeleton panel-skeleton" /></div> : error ? <PaymentsError message={(error as Error).message} retry={() => { payments.refetch(); if (user.role === "ADMIN") adminSummary.refetch(); else { residentSummary.refetch(); ledger.refetch(); } }} /> : <>
      <section className="payment-kpis">
        <article className="glass-surface"><Wallet size={19} /><div><span>{user.role === "ADMIN" ? "Resident funds" : "Current balance"}</span><strong>{formatMoney(user.role === "ADMIN" ? totalFunds : residentBalance)}</strong><small>{user.role === "ADMIN" ? `${adminBalances.length} resident positions` : "approved ledger entries only"}</small></div></article>
        <article className="glass-surface"><History size={19} /><div><span>Pending review</span><strong>{counts.pending}</strong><small>not credited yet</small></div></article>
        <article className="glass-surface"><Check size={19} /><div><span>Approved</span><strong>{counts.approved}</strong><small>credited to ledger</small></div></article>
        <article className="glass-surface"><CircleX size={19} /><div><span>Rejected / void</span><strong>{counts.rejected + counts.void}</strong><small>preserved in history</small></div></article>
      </section>

      {user.role === "USER" ? <section className="payment-submit-panel glass-surface">
        <div className="panel-head"><div><span className="eyebrow">SUBMIT PAYMENT</span><h2>Send payment for verification</h2><p className="panel-subcopy">Reference behavior is preserved: your submission stays pending until an administrator reviews it. Proof is stored privately in R2.</p></div><Upload size={20} /></div>
        <div className="payment-form-grid">
          <label><span>Amount (INR)</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="2500.00" /></label>
          <label><span>Payment method</span><select value={method} onChange={(event) => setMethod(event.target.value as Method)}>{methods.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
          <label><span>Reference / UTR / Txn ID</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional transaction reference" maxLength={160} /></label>
          <label><span>Notes</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note for the administrator" maxLength={500} /></label>
          <label className="wide payment-proof-input"><span>Supporting proof</span><input key={fileKey} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple onChange={(event) => setProofs(Array.from(event.target.files ?? []))} /><small>Required · PDF/JPG/PNG/WebP · max 3 files · 5 MB each</small></label>
          {proofs.length ? <div className="wide selected-proofs">{proofs.map((file) => <span key={`${file.name}-${file.size}`}><FileCheck2 size={14} />{file.name}<small>{fileSize(file.size)}</small></span>)}</div> : null}
          <button className="primary-button payment-submit" disabled={submitPayment.isPending} onClick={submit}>{submitPayment.isPending ? "Submitting…" : "Submit for approval"}<Upload size={16} /></button>
        </div>
      </section> : <section className="fund-balance-strip glass-surface"><div className="panel-head"><div><span className="eyebrow">FUND POSITIONS</span><h2>Approved resident balances</h2><p className="panel-subcopy">Pending submissions do not affect these numbers.</p></div><Wallet size={20} /></div><div className="fund-balance-chips">{adminBalances.map((resident) => <span key={resident.userId}><UserRound size={14} /><strong>{resident.name}</strong><em>{formatMoney(resident.balanceMinor)}</em></span>)}</div></section>}

      <section className="payments-list-panel glass-surface">
        <div className="payment-list-toolbar"><div><span className="eyebrow">{user.role === "ADMIN" ? "REVIEW QUEUE" : "YOUR SUBMISSIONS"}</span><h2>{user.role === "ADMIN" ? "Resident payment submissions" : "Payment history"}</h2></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ALL" | PaymentStatus)}><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="VOID">Void</option></select></div>
        <div className="payment-list">{rows.length === 0 ? <div className="payment-empty"><History size={24} /><strong>No payment submissions</strong><span>{user.role === "USER" ? "Submit a payment with proof to start the review workflow." : "Resident submissions will appear here."}</span></div> : rows.map((payment) => <article className={`payment-review-row status-${payment.status.toLowerCase()}`} key={payment.id}>
          <div className="payment-review-main"><div className="payment-review-title"><div><strong>{user.role === "ADMIN" ? payment.userName : paymentMethod(payment.method)}</strong><span>{user.role === "ADMIN" ? `${payment.room ?? "No room"} · ${paymentMethod(payment.method)}` : timeLabel(payment.submittedAt)}</span></div><strong className="review-amount">{formatMoney(payment.amountMinor, payment.currency)}</strong><i className={`payment-status status-${payment.status.toLowerCase()}`}>{payment.status}</i></div>
            <div className="payment-review-meta"><span>Submitted {timeLabel(payment.submittedAt)}</span>{payment.reference ? <span>Reference: {payment.reference}</span> : null}{payment.note ? <span>Note: {payment.note}</span> : null}</div>
            <div className="proof-list">{payment.proofs.map((proof) => <a key={proof.id} href={`/api/v1/payments/${payment.id}/proofs/${proof.id}`} target="_blank" rel="noreferrer"><FileCheck2 size={14} /><span>{proof.filename}</span><small>{fileSize(proof.sizeBytes)}</small><ExternalLink size={12} /></a>)}</div>
            {payment.reviewedAt ? <div className="review-decision"><span>Reviewed {timeLabel(payment.reviewedAt)}{payment.reviewedByName ? ` by ${payment.reviewedByName}` : ""}</span>{payment.reviewNote ? <strong>{payment.reviewNote}</strong> : null}</div> : null}
          </div>
          {user.role === "ADMIN" && (payment.status === "PENDING" || payment.status === "APPROVED") ? <div className="payment-review-actions">
            {(payment.status === "PENDING" || payment.status === "APPROVED") && <input value={reviewReasons[payment.id] ?? ""} onChange={(event) => setReviewReasons((reasons) => ({ ...reasons, [payment.id]: event.target.value }))} placeholder={payment.status === "APPROVED" ? "Reason required to void" : "Reason for reject/void (approve optional)"} maxLength={500} />}
            {payment.status === "PENDING" ? <button className="approve-payment" disabled={reviewPayment.isPending} onClick={() => act(payment, "APPROVE")}><Check size={15} /> Approve</button> : null}
            {payment.status === "PENDING" ? <button className="reject-payment" disabled={reviewPayment.isPending} onClick={() => act(payment, "REJECT")}><XCircle size={15} /> Reject</button> : null}
            <button className="void-payment" disabled={reviewPayment.isPending} onClick={() => act(payment, "VOID")}><CircleX size={15} /> Void</button>
          </div> : null}
        </article>)}</div>
      </section>

      {user.role === "USER" && ledger.data ? <ResidentLedger ledger={ledger.data} /> : null}
    </>}
  </motion.div>;
}

function ResidentLedger({ ledger }: { ledger: LedgerData }) {
  return <section className="resident-ledger glass-surface"><div className="panel-head"><div><span className="eyebrow">RESIDENT FUND LEDGER</span><h2>Approved money movements</h2><p className="panel-subcopy">Pending and rejected submissions never appear here. Voiding an approved payment adds a separate debit rather than deleting the credit.</p></div><Wallet size={20} /></div><div className="ledger-balance"><span>Current balance</span><strong>{formatMoney(ledger.balanceMinor, ledger.currency)}</strong></div><div className="ledger-list">{ledger.entries.map((entry) => <article key={entry.id}><i className={entry.direction === "CREDIT" ? "credit" : "debit"}>{entry.direction === "CREDIT" ? "+" : "−"}</i><div><strong>{entry.narrative}</strong><span>{entry.entryType.replaceAll("_", " ")} · {timeLabel(entry.postedAt)} · {entry.postedByName}</span></div><em>{entry.direction === "CREDIT" ? "+" : "−"}{formatMoney(entry.amountMinor, entry.currency)}</em></article>)}</div></section>;
}
