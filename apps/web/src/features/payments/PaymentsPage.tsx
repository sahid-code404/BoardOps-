import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, CreditCard, History, Landmark, ReceiptText, RefreshCw, RotateCcw, ShieldCheck, UserRound, Wallet } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "../../lib/api";
import "./payments.css";

type Role = "ADMIN" | "USER";
type Viewer = { id: string; name: string; role: Role; room: string | null };
type Method = "CASH" | "BANK_TRANSFER" | "UPI" | "CARD" | "OTHER";

type Payment = {
  id: string;
  userId: string;
  userName: string;
  room: string | null;
  amountMinor: number;
  currency: string;
  method: Method;
  reference: string | null;
  note: string | null;
  postedByName: string;
  postedAt: string;
  reversalId: string | null;
  reversalReason: string | null;
  reversedByName: string | null;
  reversedAt: string | null;
};

type BalanceRow = { userId: string; name: string; room: string | null; institutionUserId: string | null; balanceMinor: number };
type LedgerEntry = { id: string; direction: "CREDIT" | "DEBIT"; amountMinor: number; currency: string; entryType: string; sourceType: string; sourceId: string; narrative: string; postedByName: string; postedAt: string };
type LedgerData = { resident: { id: string; name: string; room: string | null; institutionUserId: string | null }; balanceMinor: number; currency: string; entries: LedgerEntry[] };

const methods: Array<{ value: Method; label: string }> = [
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
];

function formatMoney(amountMinor: number, currency = "INR") {
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  const major = Math.trunc(absolute / 100);
  const minor = String(absolute % 100).padStart(2, "0");
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  return `${sign}${symbol}${major.toLocaleString("en-IN")}.${minor}`;
}

function parseMajorToMinor(value: string): number | null {
  const normalized = value.trim().replaceAll(",", "");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [major = "0", fraction = ""] = normalized.split(".");
  try {
    const amount = BigInt(major) * 100n + BigInt((fraction + "00").slice(0, 2));
    if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(amount);
  } catch {
    return null;
  }
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function methodLabel(method: Method) {
  return methods.find((item) => item.value === method)?.label ?? method;
}

function PaymentsError({ message, retry }: { message: string; retry: () => void }) {
  return <section className="payments-error glass-surface"><ShieldCheck size={26} /><strong>Couldn’t load payments</strong><span>{message}</span><button onClick={retry}><RefreshCw size={15} /> Try again</button></section>;
}

export function PaymentsPage({ user }: { user: Viewer }) {
  const queryClient = useQueryClient();
  const [residentFilter, setResidentFilter] = useState("");
  const [residentId, setResidentId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("UPI");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");

  const adminSummary = useQuery({
    queryKey: ["funds-summary", "admin"],
    queryFn: () => apiRequest<{ currency: string; balances: BalanceRow[] }>("/funds/summary"),
    enabled: user.role === "ADMIN",
  });

  const residentSummary = useQuery({
    queryKey: ["funds-summary", "resident"],
    queryFn: () => apiRequest<{ currency: string; balanceMinor: number }>("/funds/summary"),
    enabled: user.role === "USER",
  });

  const payments = useQuery({
    queryKey: ["payments", residentFilter],
    queryFn: () => apiRequest<{ payments: Payment[] }>(`/payments${user.role === "ADMIN" && residentFilter ? `?userId=${encodeURIComponent(residentFilter)}` : ""}`),
  });

  const ledger = useQuery({
    queryKey: ["fund-ledger"],
    queryFn: () => apiRequest<LedgerData>("/funds/ledger"),
    enabled: user.role === "USER",
  });

  const invalidateFinancial = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["payments"] }),
      queryClient.invalidateQueries({ queryKey: ["funds-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["fund-ledger"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  };

  const postPayment = useMutation({
    mutationFn: (input: { userId: string; amountMinor: number; method: Method; reference?: string; note?: string; idempotencyKey: string }) => apiRequest<{ payment: Payment; idempotent: boolean }>("/payments", {
      method: "POST",
      body: JSON.stringify(input),
    }),
    onSuccess: async ({ idempotent }) => {
      toast.success(idempotent ? "Payment was already posted; no duplicate was created" : "Payment posted to the resident fund");
      setAmount(""); setReference(""); setNote("");
      await invalidateFinancial();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reversePayment = useMutation({
    mutationFn: (input: { id: string; reason: string; idempotencyKey: string }) => apiRequest<{ payment: Payment; idempotent: boolean }>(`/payments/${input.id}/reverse`, {
      method: "POST",
      body: JSON.stringify({ reason: input.reason, idempotencyKey: input.idempotencyKey }),
    }),
    onSuccess: async ({ idempotent }) => {
      toast.success(idempotent ? "This reversal was already posted" : "Payment reversed with a compensating ledger entry");
      setReversingId(null); setReversalReason("");
      await invalidateFinancial();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const adminBalances = adminSummary.data?.balances ?? [];
  const residentBalance = residentSummary.data?.balanceMinor ?? 0;
  const totalFunds = useMemo(() => adminBalances.reduce((sum, item) => sum + item.balanceMinor, 0), [adminBalances]);
  const activePayments = (payments.data?.payments ?? []).filter((payment) => !payment.reversalId).length;
  const reversedPayments = (payments.data?.payments ?? []).filter((payment) => Boolean(payment.reversalId)).length;
  const summaryError = user.role === "ADMIN" ? adminSummary.error : residentSummary.error;
  const summaryLoading = user.role === "ADMIN" ? adminSummary.isLoading : residentSummary.isLoading;
  const error = summaryError || payments.error || (user.role === "USER" ? ledger.error : null);
  const loading = summaryLoading || payments.isLoading || (user.role === "USER" && ledger.isLoading);

  const submitPayment = () => {
    const amountMinor = parseMajorToMinor(amount);
    if (!residentId) return toast.error("Choose a resident");
    if (!amountMinor) return toast.error("Enter a valid positive amount with at most 2 decimal places");
    postPayment.mutate({
      userId: residentId,
      amountMinor,
      method,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      idempotencyKey: `web-payment-${crypto.randomUUID()}`,
    });
  };

  const submitReversal = (payment: Payment) => {
    const reason = reversalReason.trim();
    if (reason.length < 3) return toast.error("Enter a reversal reason of at least 3 characters");
    reversePayment.mutate({ id: payment.id, reason, idempotencyKey: `web-reversal-${crypto.randomUUID()}` });
  };

  return <motion.div className="page-stack payments-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <section className="page-heading payments-heading">
      <div><span className="eyebrow">RESIDENT FUNDS</span><h1>Payments & ledger</h1><p>{user.role === "ADMIN" ? "Post receipts through one canonical command. Corrections are reversals, never deletion or historical mutation." : "See every credit and debit that makes up your resident fund balance."}</p></div>
      <div className="accounting-safety"><ShieldCheck size={18} /><div><span>Accounting mode</span><strong>Integer money · append-only ledger</strong></div></div>
    </section>

    {loading ? <div className="payments-skeleton-grid"><div className="skeleton kpi" /><div className="skeleton kpi" /><div className="skeleton panel-skeleton" /></div> : error ? <PaymentsError message={(error as Error).message} retry={() => { if (user.role === "ADMIN") adminSummary.refetch(); else residentSummary.refetch(); payments.refetch(); if (user.role === "USER") ledger.refetch(); }} /> : <>
      <section className="payment-kpis">
        <article className="glass-surface"><Wallet size={19} /><div><span>{user.role === "ADMIN" ? "Resident funds" : "Current balance"}</span><strong>{formatMoney(user.role === "ADMIN" ? totalFunds : residentBalance)}</strong><small>{user.role === "ADMIN" ? `${adminBalances.length} active residents` : "derived from immutable ledger entries"}</small></div></article>
        <article className="glass-surface"><CheckCircle2 size={19} /><div><span>Posted payments</span><strong>{activePayments}</strong><small>currently unreversed</small></div></article>
        <article className="glass-surface"><RotateCcw size={19} /><div><span>Reversals</span><strong>{reversedPayments}</strong><small>preserved corrections</small></div></article>
      </section>

      {user.role === "ADMIN" ? <>
        <section className="payment-admin-grid">
          <article className="payment-form-panel glass-surface">
            <div className="panel-head"><div><span className="eyebrow">POST PAYMENT</span><h2>Record resident receipt</h2><p className="panel-subcopy">The server creates the payment, ledger credit, audit record, notification and durable outbox event atomically.</p></div><CreditCard size={20} /></div>
            <div className="payment-form-grid">
              <label className="wide"><span>Resident</span><select value={residentId} onChange={(event) => setResidentId(event.target.value)}><option value="">Choose resident…</option>{adminBalances.map((resident) => <option key={resident.userId} value={resident.userId}>{resident.name} · {resident.room ?? "No room"} · {formatMoney(resident.balanceMinor)}</option>)}</select></label>
              <label><span>Amount (INR)</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="2500.00" /></label>
              <label><span>Method</span><select value={method} onChange={(event) => setMethod(event.target.value as Method)}>{methods.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
              <label><span>Reference</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional bank/UPI reference" maxLength={160} /></label>
              <label><span>Note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional internal note" maxLength={500} /></label>
              <button className="primary-button payment-submit" disabled={postPayment.isPending} onClick={submitPayment}>{postPayment.isPending ? "Posting…" : "Post payment"}<ArrowDownLeft size={17} /></button>
            </div>
          </article>

          <article className="fund-balances glass-surface">
            <div className="panel-head"><div><span className="eyebrow">FUND BALANCES</span><h2>Resident positions</h2></div><Landmark size={20} /></div>
            <div className="fund-balance-list">{adminBalances.map((resident) => <button key={resident.userId} className={residentFilter === resident.userId ? "selected" : ""} onClick={() => setResidentFilter((current) => current === resident.userId ? "" : resident.userId)}><div className="fund-resident-icon"><UserRound size={16} /></div><div><strong>{resident.name}</strong><span>{resident.institutionUserId ?? "—"} · {resident.room ?? "No room"}</span></div><em>{formatMoney(resident.balanceMinor)}</em></button>)}</div>
          </article>
        </section>
      </> : ledger.data ? <ResidentLedger ledger={ledger.data} /> : null}

      <section className="payments-list-panel glass-surface">
        <div className="panel-head"><div><span className="eyebrow">PAYMENT HISTORY</span><h2>{user.role === "ADMIN" && residentFilter ? "Filtered receipts" : "Posted receipts"}</h2><p className="panel-subcopy">Posted records cannot be edited or deleted. A reversal adds a separate debit while preserving the original receipt.</p></div><ReceiptText size={20} /></div>
        {user.role === "ADMIN" && residentFilter ? <button className="clear-payment-filter" onClick={() => setResidentFilter("")}>Show all residents</button> : null}
        <div className="payment-list">{(payments.data?.payments ?? []).length === 0 ? <div className="payment-empty"><History size={24} /><strong>No payments yet</strong><span>Canonical posted receipts will appear here.</span></div> : (payments.data?.payments ?? []).map((payment) => <article className={`payment-row ${payment.reversalId ? "is-reversed" : ""}`} key={payment.id}>
          <div className={`payment-direction ${payment.reversalId ? "reversed" : "posted"}`}>{payment.reversalId ? <RotateCcw size={17} /> : <ArrowDownLeft size={17} />}</div>
          <div className="payment-copy"><div><strong>{payment.userName}</strong><span>{payment.room ?? "No room"} · {methodLabel(payment.method)}</span></div><small>{timeLabel(payment.postedAt)} · posted by {payment.postedByName}{payment.reference ? ` · ${payment.reference}` : ""}</small>{payment.note ? <p>{payment.note}</p> : null}{payment.reversalId ? <p className="reversal-copy">Reversed {payment.reversedAt ? timeLabel(payment.reversedAt) : ""} by {payment.reversedByName ?? "administrator"}: {payment.reversalReason}</p> : null}</div>
          <div className="payment-amount"><strong>{formatMoney(payment.amountMinor, payment.currency)}</strong><span className={payment.reversalId ? "payment-status reversed" : "payment-status posted"}>{payment.reversalId ? "REVERSED" : "POSTED"}</span></div>
          {user.role === "ADMIN" && !payment.reversalId ? <div className="payment-reversal-action">{reversingId === payment.id ? <div className="reversal-editor"><input autoFocus value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="Reason for reversal" maxLength={500} /><div><button onClick={() => { setReversingId(null); setReversalReason(""); }}>Cancel</button><button className="danger" disabled={reversePayment.isPending} onClick={() => submitReversal(payment)}>{reversePayment.isPending ? "Reversing…" : "Confirm reversal"}</button></div></div> : <button className="reverse-button" onClick={() => { setReversingId(payment.id); setReversalReason(""); }}><RotateCcw size={15} /> Reverse</button>}</div> : null}
        </article>)}</div>
      </section>
    </>}
  </motion.div>;
}

function ResidentLedger({ ledger }: { ledger: LedgerData }) {
  return <section className="resident-ledger-panel glass-surface">
    <div className="panel-head"><div><span className="eyebrow">LEDGER</span><h2>Your fund activity</h2><p className="panel-subcopy">Balance = credits − debits. No running-balance field is trusted or mutated.</p></div><History size={20} /></div>
    <div className="resident-ledger-balance"><span>Current resident fund</span><strong>{formatMoney(ledger.balanceMinor, ledger.currency)}</strong><small>{ledger.entries.length} immutable entr{ledger.entries.length === 1 ? "y" : "ies"}</small></div>
    <div className="ledger-list">{ledger.entries.map((entry) => <div className="ledger-row" key={entry.id}><div className={entry.direction === "CREDIT" ? "ledger-icon credit" : "ledger-icon debit"}>{entry.direction === "CREDIT" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</div><div><strong>{entry.narrative}</strong><span>{entry.entryType.replaceAll("_", " ").toLowerCase()} · {timeLabel(entry.postedAt)}</span></div><em className={entry.direction === "CREDIT" ? "credit" : "debit"}>{entry.direction === "CREDIT" ? "+" : "-"}{formatMoney(entry.amountMinor, entry.currency)}</em></div>)}</div>
  </section>;
}
