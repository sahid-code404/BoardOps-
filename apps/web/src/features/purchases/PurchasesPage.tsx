import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  Boxes,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  IndianRupee,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShoppingCart,
  Store,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "../../lib/api";
import "./purchases.css";

type UnitCategory = "WEIGHT" | "VOLUME" | "QUANTITY" | "OTHER";
type Unit = { id: string; name: string; category: UnitCategory; isActive: boolean };
type Product = {
  id: string; name: string; slug: string; category: string; defaultUnitId: string | null; isActive: boolean; archivedAt: string | null;
  defaultUnit: { id: string; name: string; category: UnitCategory; isActive: boolean } | null;
};
type PurchaseItem = {
  id: string; productId: string | null; productName: string; category: string; quantityMilli: number; unit: string; rateMinor: number; totalMinor: number; notes: string | null;
};
type Purchase = {
  id: string; vendor: string; purchaseDate: string; totalAmountMinor: number; currency: string; notes: string | null; expenseId: string;
  status: "APPROVED" | "DELETED"; deletedAt: string | null; deletionReason: string | null; createdAt: string;
  user: { id: string; name: string }; items: PurchaseItem[];
};
type Stats = {
  todayTotalMinor: number; monthTotalMinor: number; monthCount: number;
  topProducts: Array<{ name: string; totalSpendMinor: number; totalQuantityMilli: number }>;
  topCategories: Array<{ category: string; totalSpendMinor: number }>;
};
type DraftItem = {
  key: string; productId: string; productName: string; category: string; quantity: string; unit: string; rate: string; notes: string;
};

type Tab = "purchases" | "catalog";

const unitCategories: UnitCategory[] = ["QUANTITY", "WEIGHT", "VOLUME", "OTHER"];
const emptyItem = (): DraftItem => ({ key: crypto.randomUUID(), productId: "", productName: "", category: "GENERAL", quantity: "1", unit: "piece", rate: "0", notes: "" });

function formatMoney(minor: number, currency = "INR") {
  const sign = minor < 0 ? "-" : "";
  const value = Math.abs(minor);
  const major = Math.trunc(value / 100);
  const cents = String(value % 100).padStart(2, "0");
  return `${sign}${currency === "INR" ? "₹" : `${currency} `}${major.toLocaleString("en-IN")}.${cents}`;
}

function parseMoney(value: string): number | null {
  const normalized = value.trim().replaceAll(",", "");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [major = "0", fraction = ""] = normalized.split(".");
  try {
    const minor = BigInt(major) * 100n + BigInt((fraction + "00").slice(0, 2));
    if (minor < 0n || minor > 1_000_000_000n) return null;
    return Number(minor);
  } catch { return null; }
}

function parseQuantity(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{0,3})?$/.test(normalized)) return null;
  const [whole = "0", fraction = ""] = normalized.split(".");
  try {
    const milli = BigInt(whole) * 1000n + BigInt((fraction + "000").slice(0, 3));
    if (milli <= 0n || milli > 1_000_000n) return null;
    return Number(milli);
  } catch { return null; }
}

function quantityLabel(milli: number) {
  const whole = Math.trunc(milli / 1000);
  const decimal = String(milli % 1000).padStart(3, "0").replace(/0+$/, "");
  return decimal ? `${whole}.${decimal}` : String(whole);
}

function lineTotal(item: DraftItem) {
  const quantityMilli = parseQuantity(item.quantity);
  const rateMinor = parseMoney(item.rate);
  if (quantityMilli === null || rateMinor === null) return 0;
  return Math.round((quantityMilli * rateMinor) / 1000);
}

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function Modal({ children, onClose, wide = false }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <motion.div className="purchase-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.section role="dialog" aria-modal="true" className={`purchase-modal glass-surface ${wide ? "wide" : ""}`} initial={{ opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: .98 }}>
      {children}
    </motion.section>
  </motion.div>;
}

export function PurchasesPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [tab, setTab] = useState<Tab>("purchases");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);
  const [deletePurchase, setDeletePurchase] = useState<Purchase | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const purchases = useQuery({
    queryKey: ["purchases", year, month, showDeleted],
    queryFn: () => apiRequest<Purchase[]>(`/purchases?year=${year}&month=${month}&limit=500${showDeleted ? "&includeDeleted=true" : ""}`),
  });
  const stats = useQuery({
    queryKey: ["purchases-stats", year, month],
    queryFn: () => apiRequest<Stats>(`/purchases/stats?year=${year}&month=${month}`),
  });
  const products = useQuery({ queryKey: ["products", "all"], queryFn: () => apiRequest<Product[]>("/products?includeArchived=true") });
  const units = useQuery({ queryKey: ["units"], queryFn: () => apiRequest<Unit[]>("/units") });

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["purchases"] }),
      qc.invalidateQueries({ queryKey: ["purchases-stats"] }),
      qc.invalidateQueries({ queryKey: ["products"] }),
      qc.invalidateQueries({ queryKey: ["units"] }),
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  };

  const purchaseAction = useMutation({
    mutationFn: (input: { id: string; action: "SOFT_DELETE" | "RESTORE"; reason?: string }) => apiRequest<{ purchase: Purchase; changed: boolean }>(`/purchases/${input.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: input.action, reason: input.reason, idempotencyKey: `web-purchase-action-${crypto.randomUUID()}` }),
    }),
    onSuccess: async ({ purchase }) => {
      toast.success(purchase.status === "DELETED" ? "Purchase removed safely; history was preserved" : "Purchase restored");
      setDeletePurchase(null); setDeleteReason("");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const moveMonth = (delta: number) => {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) { nextMonth = 12; nextYear -= 1; }
    if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
    setMonth(nextMonth); setYear(nextYear);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchases.data ?? [];
    return (purchases.data ?? []).filter((purchase) => purchase.vendor.toLowerCase().includes(q) || purchase.items.some((item) => item.productName.toLowerCase().includes(q)));
  }, [purchases.data, search]);

  const loading = purchases.isLoading || stats.isLoading || products.isLoading || units.isLoading;
  const error = purchases.error || stats.error || products.error || units.error;

  return <motion.div className="page-stack purchases-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <section className="page-heading purchases-heading">
      <div><span className="eyebrow">PURCHASES & SHOPPING</span><h1>Purchases</h1><p>Same BoardOps shopping workflow: multi-item purchases, catalog-backed items and an automatically linked expense—now with integer money and non-destructive corrections.</p></div>
      <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={17} /> New Purchase</button>
    </section>

    <div className="purchase-tabs glass-surface">
      <button className={tab === "purchases" ? "active" : ""} onClick={() => setTab("purchases")}><ShoppingCart size={16} /> Purchases</button>
      <button className={tab === "catalog" ? "active" : ""} onClick={() => setTab("catalog")}><Boxes size={16} /> Products & Units</button>
    </div>

    {loading ? <div className="purchase-loading"><div className="skeleton kpi" /><div className="skeleton kpi" /><div className="skeleton panel-skeleton" /></div>
      : error ? <section className="purchase-error glass-surface"><RefreshCw size={24} /><strong>Couldn’t load purchases</strong><span>{(error as Error).message}</span><button onClick={() => { purchases.refetch(); stats.refetch(); products.refetch(); units.refetch(); }}>Try again</button></section>
      : tab === "purchases" ? <>
        <section className="purchase-period glass-surface"><button onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button><strong>{monthLabel(year, month)}</strong><button onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button></section>
        <section className="purchase-kpis">
          <article className="glass-surface"><Calendar size={18} /><div><span>Today</span><strong>{formatMoney(stats.data?.todayTotalMinor ?? 0)}</strong></div></article>
          <article className="glass-surface"><IndianRupee size={18} /><div><span>This month</span><strong>{formatMoney(stats.data?.monthTotalMinor ?? 0)}</strong></div></article>
          <article className="glass-surface"><ShoppingCart size={18} /><div><span>Purchase count</span><strong>{stats.data?.monthCount ?? 0}</strong></div></article>
          <article className="glass-surface"><Package size={18} /><div><span>Top product</span><strong className="small-value">{stats.data?.topProducts?.[0]?.name ?? "—"}</strong><small>{stats.data?.topProducts?.[0] ? formatMoney(stats.data.topProducts[0].totalSpendMinor) : "No spend yet"}</small></div></article>
        </section>

        {(stats.data?.topCategories?.length ?? 0) > 0 ? <section className="purchase-categories glass-surface"><span className="eyebrow">TOP CATEGORIES</span><div>{stats.data!.topCategories.map((category) => <span key={category.category}>{category.category}<strong>{formatMoney(category.totalSpendMinor)}</strong></span>)}</div></section> : null}

        <section className="purchase-toolbar glass-surface">
          <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search vendor or product…" /></label>
          <label className="purchase-check"><input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} /><span>Show removed</span></label>
        </section>

        <section className="purchase-list">
          {filtered.length === 0 ? <article className="purchase-empty glass-surface"><ShoppingCart size={34} /><strong>No purchases this month</strong><span>Record a shopping trip to track vendor spend, items, quantities and the linked expense.</span><button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={16} /> New Purchase</button></article>
            : filtered.map((purchase) => <motion.article layout className={`purchase-row glass-surface ${purchase.status === "DELETED" ? "deleted" : ""}`} key={purchase.id}>
              <div className="purchase-store"><Store size={19} /></div>
              <div className="purchase-main"><div><strong>{purchase.vendor}</strong><span className={`purchase-status ${purchase.status.toLowerCase()}`}>{purchase.status === "DELETED" ? "REMOVED" : "APPROVED"}</span></div><span>{shortDate(purchase.purchaseDate)} · by {purchase.user.name}</span><small>{purchase.items.slice(0, 4).map((item) => `${item.productName} (${quantityLabel(item.quantityMilli)} ${item.unit})`).join(", ")}{purchase.items.length > 4 ? ` +${purchase.items.length - 4} more` : ""}</small>{purchase.status === "DELETED" && purchase.deletionReason ? <em>{purchase.deletionReason}</em> : null}</div>
              <div className="purchase-total"><strong>{formatMoney(purchase.totalAmountMinor, purchase.currency)}</strong><span>{purchase.items.length} item{purchase.items.length === 1 ? "" : "s"}</span></div>
              <div className="purchase-actions"><button onClick={() => setViewPurchase(purchase)} title="View"><Eye size={16} /></button>{purchase.status === "DELETED" ? <button className="restore" onClick={() => purchaseAction.mutate({ id: purchase.id, action: "RESTORE" })} disabled={purchaseAction.isPending}><RotateCcw size={16} /> Restore</button> : <button className="remove" onClick={() => { setDeletePurchase(purchase); setDeleteReason(""); }}><Trash2 size={16} /> Delete</button>}</div>
            </motion.article>)}
        </section>
      </> : <CatalogPanel products={products.data ?? []} units={units.data ?? []} invalidate={invalidate} />}

    <AnimatePresence>
      {createOpen ? <NewPurchaseModal products={(products.data ?? []).filter((product) => product.isActive)} units={(units.data ?? []).filter((unit) => unit.isActive)} onClose={() => setCreateOpen(false)} onCreated={async () => { setCreateOpen(false); await invalidate(); }} /> : null}
      {viewPurchase ? <Modal onClose={() => setViewPurchase(null)}><div className="purchase-modal-head"><div><span className="eyebrow">PURCHASE DETAIL</span><h2>{viewPurchase.vendor}</h2><p>{shortDate(viewPurchase.purchaseDate)} · linked expense {viewPurchase.expenseId.slice(0, 8)}…</p></div><button onClick={() => setViewPurchase(null)}><X size={18} /></button></div><div className="purchase-detail-items">{viewPurchase.items.map((item) => <div key={item.id}><div><strong>{item.productName}</strong><span>{quantityLabel(item.quantityMilli)} {item.unit} × {formatMoney(item.rateMinor)}</span>{item.notes ? <small>{item.notes}</small> : null}</div><em>{formatMoney(item.totalMinor)}</em></div>)}</div>{viewPurchase.notes ? <p className="purchase-note">{viewPurchase.notes}</p> : null}<div className="purchase-grand-total"><span>Total</span><strong>{formatMoney(viewPurchase.totalAmountMinor)}</strong></div></Modal> : null}
      {deletePurchase ? <Modal onClose={() => setDeletePurchase(null)}><div className="purchase-modal-head danger"><div><span className="eyebrow">SAFE PURCHASE CORRECTION</span><h2>Delete Purchase</h2><p>This keeps the original purchase and linked expense intact and appends a removal event. You can restore it later.</p></div><button onClick={() => setDeletePurchase(null)}><X size={18} /></button></div><div className="delete-summary"><strong>{deletePurchase.vendor}</strong><span>{formatMoney(deletePurchase.totalAmountMinor)} · {deletePurchase.items.length} item(s)</span></div><label className="purchase-field"><span>Reason (required)</span><input value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Duplicate entry, incorrect receipt…" /></label><div className="modal-actions"><button onClick={() => setDeletePurchase(null)}>Cancel</button><button className="danger-button" disabled={deleteReason.trim().length < 3 || purchaseAction.isPending} onClick={() => purchaseAction.mutate({ id: deletePurchase.id, action: "SOFT_DELETE", reason: deleteReason.trim() })}>{purchaseAction.isPending ? "Removing…" : "Delete Purchase"}</button></div></Modal> : null}
    </AnimatePresence>
  </motion.div>;
}

function NewPurchaseModal({ products, units, onClose, onCreated }: { products: Product[]; units: Unit[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const [vendor, setVendor] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);

  const totalMinor = useMemo(() => items.reduce((sum, item) => sum + lineTotal(item), 0), [items]);
  const updateItem = (key: string, patch: Partial<DraftItem>) => setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  const selectProduct = (key: string, productId: string) => {
    if (!productId) { updateItem(key, { productId: "", productName: "", category: "GENERAL" }); return; }
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) return;
    updateItem(key, { productId, productName: product.name, category: product.category, unit: product.defaultUnit?.name ?? units[0]?.name ?? "piece" });
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!vendor.trim()) throw new Error("Vendor is required");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) throw new Error("Purchase date is required");
      const normalized = items.map((item) => {
        const quantityMilli = parseQuantity(item.quantity);
        const rateMinor = parseMoney(item.rate);
        if (!item.productName.trim()) throw new Error("Every item needs a product name");
        if (!quantityMilli) throw new Error(`Enter a valid quantity for ${item.productName || "each item"}`);
        if (rateMinor === null) throw new Error(`Enter a valid rate for ${item.productName}`);
        if (!item.unit.trim()) throw new Error(`Choose a unit for ${item.productName}`);
        return { productId: item.productId || null, productName: item.productName.trim(), category: item.category.trim() || "GENERAL", quantityMilli, unit: item.unit.trim(), rateMinor, notes: item.notes.trim() || null };
      });
      return apiRequest<{ purchase: Purchase; idempotent: boolean }>("/purchases", {
        method: "POST",
        body: JSON.stringify({ vendor: vendor.trim(), purchaseDate, notes: notes.trim() || null, items: normalized, idempotencyKey: `web-purchase-${crypto.randomUUID()}` }),
      });
    },
    onSuccess: async ({ purchase, idempotent }) => { toast.success(idempotent ? "Purchase already existed; no duplicate was created" : `Purchase of ${formatMoney(purchase.totalAmountMinor)} recorded`); await onCreated(); },
    onError: (error: Error) => toast.error(error.message),
  });

  return <Modal onClose={onClose} wide><div className="purchase-modal-head"><div><span className="eyebrow">NEW PURCHASE</span><h2>Record shopping</h2><p>Multi-item purchase with an automatically linked expense, matching the reference BoardOps workflow.</p></div><button onClick={onClose}><X size={18} /></button></div>
    <div className="purchase-form-two"><label className="purchase-field"><span>Vendor / Shop *</span><input value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="Local Market" /></label><label className="purchase-field"><span>Purchase Date *</span><input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} /></label></div>
    <div className="purchase-items-head"><strong>Items</strong><button onClick={() => setItems((current) => [...current, emptyItem()])}><Plus size={15} /> Add item</button></div>
    <div className="draft-items">{items.map((item, index) => <div className="draft-item" key={item.key}><div className="draft-top"><span>Item {index + 1}</span><button disabled={items.length === 1} onClick={() => setItems((current) => current.filter((candidate) => candidate.key !== item.key))}><X size={15} /></button></div><div className="draft-grid">
      <label className="purchase-field wide"><span>Product</span><select value={item.productId} onChange={(event) => selectProduct(item.key, event.target.value)}><option value="">Custom product</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name} · {product.category}</option>)}</select></label>
      {!item.productId ? <label className="purchase-field"><span>Product name *</span><input value={item.productName} onChange={(event) => updateItem(item.key, { productName: event.target.value })} placeholder="Rice" /></label> : <label className="purchase-field"><span>Product name</span><input value={item.productName} disabled /></label>}
      <label className="purchase-field"><span>Category</span><input value={item.category} onChange={(event) => updateItem(item.key, { category: event.target.value.toUpperCase() })} disabled={Boolean(item.productId)} /></label>
      <label className="purchase-field"><span>Qty *</span><input inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: event.target.value })} /></label>
      <label className="purchase-field"><span>Unit *</span><select value={item.unit} onChange={(event) => updateItem(item.key, { unit: event.target.value })}>{units.map((unit) => <option key={unit.id} value={unit.name}>{unit.name}</option>)}{!units.some((unit) => unit.name === item.unit) ? <option value={item.unit}>{item.unit}</option> : null}</select></label>
      <label className="purchase-field"><span>Rate (₹) *</span><input inputMode="decimal" value={item.rate} onChange={(event) => updateItem(item.key, { rate: event.target.value })} /></label>
      <div className="draft-total"><span>Total</span><strong>{formatMoney(lineTotal(item))}</strong></div>
      <label className="purchase-field wide"><span>Item note (optional)</span><input value={item.notes} onChange={(event) => updateItem(item.key, { notes: event.target.value })} placeholder="Brand, quality, pack size…" /></label>
    </div></div>)}</div>
    <label className="purchase-field"><span>Purchase notes (optional)</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Weekly groceries, morning market run…" /></label>
    <div className="purchase-grand-total"><span>Purchase Total</span><strong>{formatMoney(totalMinor)}</strong></div>
    <div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary-button" disabled={create.isPending || !vendor.trim()} onClick={() => create.mutate()}>{create.isPending ? "Recording…" : "Record Purchase"}</button></div>
  </Modal>;
}

function CatalogPanel({ products, units, invalidate }: { products: Product[]; units: Unit[]; invalidate: () => Promise<void> }) {
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState("GENERAL");
  const [productUnit, setProductUnit] = useState("");
  const [unitName, setUnitName] = useState("");
  const [unitCategory, setUnitCategory] = useState<UnitCategory>("QUANTITY");
  const [editing, setEditing] = useState<Product | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editUnit, setEditUnit] = useState("");

  const createProduct = useMutation({
    mutationFn: () => apiRequest<Product>("/products", { method: "POST", body: JSON.stringify({ name: productName.trim(), category: productCategory.trim().toUpperCase(), defaultUnitId: productUnit || null }) }),
    onSuccess: async () => { toast.success("Product created"); setProductName(""); setProductCategory("GENERAL"); setProductUnit(""); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const updateProduct = useMutation({
    mutationFn: (input: { id: string; data: Partial<{ name: string; category: string; defaultUnitId: string | null; isActive: boolean }> }) => apiRequest<Product>(`/products/${input.id}`, { method: "PATCH", body: JSON.stringify(input.data) }),
    onSuccess: async () => { toast.success("Product updated"); setEditing(null); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const archiveProduct = useMutation({
    mutationFn: (id: string) => apiRequest<{ archived: boolean; usageCount: number }>(`/products/${id}`, { method: "DELETE", body: "{}" }),
    onSuccess: async ({ usageCount }) => { toast.success(usageCount ? `Product archived; ${usageCount} historical item(s) preserved` : "Product archived safely"); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const createUnit = useMutation({
    mutationFn: () => apiRequest<Unit>("/units", { method: "POST", body: JSON.stringify({ name: unitName.trim(), category: unitCategory, isActive: true }) }),
    onSuccess: async () => { toast.success("Unit created"); setUnitName(""); setUnitCategory("QUANTITY"); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const updateUnit = useMutation({
    mutationFn: (input: { id: string; data: Partial<{ category: UnitCategory; isActive: boolean }> }) => apiRequest<Unit>(`/units/${input.id}`, { method: "PATCH", body: JSON.stringify(input.data) }),
    onSuccess: async () => { toast.success("Unit updated"); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const deactivateUnit = useMutation({
    mutationFn: (id: string) => apiRequest<Unit>(`/units/${id}`, { method: "DELETE", body: "{}" }),
    onSuccess: async () => { toast.success("Unit deactivated"); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const beginEdit = (product: Product) => { setEditing(product); setEditName(product.name); setEditCategory(product.category); setEditUnit(product.defaultUnitId ?? ""); };

  return <section className="catalog-grid">
    <article className="catalog-panel glass-surface"><div className="panel-head"><div><span className="eyebrow">PRODUCT CATALOG</span><h2>Products</h2><p className="panel-subcopy">Catalog values feed the purchase form; historical purchase items keep their own snapshots.</p></div><Tags size={20} /></div>
      <div className="catalog-create"><input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Product name" /><input value={productCategory} onChange={(event) => setProductCategory(event.target.value.toUpperCase())} placeholder="Category" /><select value={productUnit} onChange={(event) => setProductUnit(event.target.value)}><option value="">No default unit</option>{units.filter((unit) => unit.isActive).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select><button disabled={!productName.trim() || createProduct.isPending} onClick={() => createProduct.mutate()}><Plus size={15} /> Add</button></div>
      <div className="catalog-list">{products.map((product) => <div className={`catalog-row ${!product.isActive ? "inactive" : ""}`} key={product.id}>{editing?.id === product.id ? <div className="catalog-edit"><input value={editName} onChange={(event) => setEditName(event.target.value)} /><input value={editCategory} onChange={(event) => setEditCategory(event.target.value.toUpperCase())} /><select value={editUnit} onChange={(event) => setEditUnit(event.target.value)}><option value="">No default unit</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select><button onClick={() => updateProduct.mutate({ id: product.id, data: { name: editName.trim(), category: editCategory.trim(), defaultUnitId: editUnit || null } })}><Save size={15} /> Save</button><button onClick={() => setEditing(null)}><X size={15} /></button></div> : <><div><strong>{product.name}</strong><span>{product.category} · {product.defaultUnit?.name ?? "No default unit"}</span></div><span className={`catalog-state ${product.isActive ? "active" : ""}`}>{product.isActive ? "ACTIVE" : "ARCHIVED"}</span><div className="catalog-actions"><button onClick={() => beginEdit(product)}><Edit3 size={15} /></button>{product.isActive ? <button onClick={() => archiveProduct.mutate(product.id)}><Archive size={15} /> Archive</button> : <button onClick={() => updateProduct.mutate({ id: product.id, data: { isActive: true } })}><RotateCcw size={15} /> Restore</button>}</div></>}</div>)}</div>
    </article>

    <article className="catalog-panel glass-surface"><div className="panel-head"><div><span className="eyebrow">MEASUREMENT</span><h2>Units</h2><p className="panel-subcopy">Reference-compatible unit categories with safe deactivation when no product depends on the unit.</p></div><Boxes size={20} /></div>
      <div className="catalog-create units"><input value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="kg, litre, piece…" /><select value={unitCategory} onChange={(event) => setUnitCategory(event.target.value as UnitCategory)}>{unitCategories.map((category) => <option key={category}>{category}</option>)}</select><button disabled={!unitName.trim() || createUnit.isPending} onClick={() => createUnit.mutate()}><Plus size={15} /> Add</button></div>
      <div className="catalog-list">{units.map((unit) => <div className={`catalog-row unit-row ${!unit.isActive ? "inactive" : ""}`} key={unit.id}><div><strong>{unit.name}</strong><span>{unit.category}</span></div><select value={unit.category} onChange={(event) => updateUnit.mutate({ id: unit.id, data: { category: event.target.value as UnitCategory } })}>{unitCategories.map((category) => <option key={category}>{category}</option>)}</select><div className="catalog-actions">{unit.isActive ? <button onClick={() => deactivateUnit.mutate(unit.id)}><Archive size={15} /> Deactivate</button> : <button onClick={() => updateUnit.mutate({ id: unit.id, data: { isActive: true } })}><RotateCcw size={15} /> Reactivate</button>}</div></div>)}</div>
    </article>
  </section>;
}
