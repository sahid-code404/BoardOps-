import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  DoorOpen,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Utensils,
  Wallet,
  X,
} from "lucide-react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

type Role = "ADMIN" | "USER";
type Status = "ACTIVE" | "PENDING" | "SUSPENDED" | "ARCHIVED";

type SessionUser = {
  id: string;
  institutionId: string;
  institutionName: string;
  email: string;
  name: string;
  role: Role;
  status: Status;
  institutionUserId: string | null;
  phone: string | null;
  room: string | null;
  avatarUrl: string | null;
};

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; error: string };

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !body.success) {
    throw new Error("error" in body ? body.error : `Request failed (${response.status})`);
  }
  return body.data;
}

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "USER"] as Role[], live: true },
  { to: "/residents", label: "Residents", icon: Users, roles: ["ADMIN"] as Role[], live: true },
  { to: "/meals", label: "Meals", icon: Utensils, roles: ["ADMIN", "USER"] as Role[], live: false },
  { to: "/billing", label: "Billing", icon: Wallet, roles: ["ADMIN", "USER"] as Role[], live: false },
  { to: "/payments", label: "Payments", icon: CreditCard, roles: ["ADMIN", "USER"] as Role[], live: false },
  { to: "/expenses", label: "Expenses", icon: Receipt, roles: ["ADMIN"] as Role[], live: false },
  { to: "/closing", label: "Monthly Closing", icon: CalendarCheck, roles: ["ADMIN"] as Role[], live: false },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["ADMIN"] as Role[], live: false },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["ADMIN"] as Role[], live: false },
];

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function dateLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function AppLoader() {
  return (
    <div className="boot-screen">
      <div className="brand-mark"><Sparkles size={22} /></div>
      <div>
        <strong>BoardOps</strong>
        <span>Loading local workspace…</span>
      </div>
    </div>
  );
}

function LoginScreen() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("admin@boardops.local");
  const [password, setPassword] = useState("boardops-demo");

  const login = useMutation({
    mutationFn: () => apiRequest<{ user: SessionUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(["session"], { user });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Welcome back, ${user.name.split(" ")[0]}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <main className="auth-shell">
      <div className="mesh mesh-one" />
      <div className="mesh mesh-two" />
      <motion.section className="auth-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <div className="auth-brand">
          <div className="brand-mark"><Sparkles size={20} /></div>
          <div><strong>BoardOps</strong><span>Institution operations, rebuilt correctly</span></div>
        </div>
        <div className="auth-copy">
          <span className="eyebrow">LOCAL DEVELOPMENT CHECKPOINT</span>
          <h1>Welcome back.</h1>
          <p>Sign in to the first real BoardOps application slice. Dashboard and Residents are connected to local D1.</p>
        </div>
        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <label>
            <span>Email</span>
            <div className="input-wrap"><UserRound size={18} /><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" /></div>
          </label>
          <label>
            <span>Password</span>
            <div className="input-wrap"><LockKeyhole size={18} /><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" /></div>
          </label>
          <button className="primary-button" disabled={login.isPending} type="submit">
            {login.isPending ? "Signing in…" : "Sign in"}<ArrowRight size={18} />
          </button>
        </form>
        <div className="demo-box">
          <ShieldCheck size={18} />
          <div>
            <strong>Development-only credentials</strong>
            <span>Admin: admin@boardops.local · Resident: arjun@boardops.local</span>
            <span>Password for both: boardops-demo</span>
          </div>
        </div>
        <div className="auth-foot"><span><CheckCircle2 size={14} /> HttpOnly local session</span><span><CheckCircle2 size={14} /> D1-backed data</span></div>
      </motion.section>
    </main>
  );
}

function Shell({ user }: { user: SessionUser }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const visibleNav = navItems.filter((item) => item.roles.includes(user.role));
  const activeLabel = visibleNav.find((item) => item.to === location.pathname)?.label ?? "BoardOps";

  const logout = useMutation({
    mutationFn: () => apiRequest<{ loggedOut: boolean }>("/auth/logout", { method: "POST", body: "{}" }),
    onSuccess: () => {
      queryClient.clear();
      navigate("/");
    },
  });

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-mark small"><Sparkles size={17} /></div><div><strong>BoardOps</strong><span>{user.institutionName}</span></div></div>
        <nav className="side-nav">
          <p className="nav-caption">Workspace</p>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            if (!item.live) {
              return <button key={item.to} className="nav-item disabled-nav" onClick={() => toast.info(`${item.label} is scheduled for a later migration phase`)}><Icon size={18} /><span>{item.label}</span><span className="soon-dot" /></button>;
            }
            return <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon size={18} /><span>{item.label}</span><ChevronRight size={15} className="nav-chevron" /></NavLink>;
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="mini-profile"><div className="avatar">{initials(user.name)}</div><div><strong>{user.name}</strong><span>{user.role === "ADMIN" ? "Administrator" : user.room ?? "Resident"}</span></div></div>
          <button className="icon-button" aria-label="Sign out" onClick={() => logout.mutate()}><LogOut size={18} /></button>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-title"><button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div><span>BoardOps</span><strong>{activeLabel}</strong></div></div>
          <div className="topbar-actions"><button className="icon-button" onClick={() => toast.info("Notifications migrate in a later phase")}><Bell size={18} /></button><div className="top-avatar">{initials(user.name)}</div></div>
        </header>
        <main className="content-area">
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route path="/residents" element={user.role === "ADMIN" ? <Residents /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button className="mobile-overlay" aria-label="Close navigation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside className="mobile-drawer" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 320, damping: 32 }}>
              <div className="drawer-head"><div className="sidebar-brand"><div className="brand-mark small"><Sparkles size={17} /></div><div><strong>BoardOps</strong><span>{user.institutionName}</span></div></div><button className="icon-button" onClick={() => setMobileOpen(false)}><X size={19} /></button></div>
              <nav className="side-nav">
                {visibleNav.map((item) => {
                  const Icon = item.icon;
                  return item.live ? <NavLink key={item.to} to={item.to} end={item.to === "/"} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon size={18} /><span>{item.label}</span></NavLink> : <button key={item.to} className="nav-item disabled-nav" onClick={() => toast.info(`${item.label} is scheduled for a later migration phase`)}><Icon size={18} /><span>{item.label}</span><span className="soon-dot" /></button>;
                })}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Dashboard({ user }: { user: SessionUser }) {
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiRequest<any>("/dashboard"),
  });

  if (dashboard.isLoading) return <PageSkeleton />;
  if (dashboard.error) return <ErrorPanel message={(dashboard.error as Error).message} onRetry={() => dashboard.refetch()} />;
  const data = dashboard.data;

  const adminKpis = [
    { label: "Active Residents", value: data?.kpis?.activeResidents ?? 0, icon: Users, hint: "currently active" },
    { label: "Pending Reviews", value: data?.kpis?.pendingResidents ?? 0, icon: Activity, hint: "need attention" },
    { label: "Occupied Rooms", value: data?.kpis?.occupiedRooms ?? 0, icon: DoorOpen, hint: "active resident rooms" },
    { label: "Suspended", value: data?.kpis?.suspendedResidents ?? 0, icon: ShieldCheck, hint: "restricted accounts" },
  ];

  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="welcome-card glass-surface">
        <div><p>{dateLabel()}</p><h1>{greeting()}, <span>{user.name.split(" ")[0]}</span> <span className="wave">👋</span></h1><small>{user.role === "ADMIN" ? "Your BoardOps workspace is ready." : `Resident workspace · ${user.room ?? "Room not assigned"}`}</small></div>
        <div className="phase-pill"><span className="live-dot" />First real app checkpoint</div>
      </section>

      {user.role === "ADMIN" ? (
        <>
          <section className="kpi-grid">{adminKpis.map(({ label, value, icon: Icon, hint }) => <motion.article whileHover={{ y: -3 }} key={label} className="kpi-card glass-surface"><div className="kpi-icon"><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></motion.article>)}</section>
          <section className="dashboard-grid">
            <article className="panel glass-surface">
              <div className="panel-head"><div><span className="eyebrow">MIGRATION STATUS</span><h2>BoardOps modules</h2></div><Building2 size={20} /></div>
              <div className="module-list">
                <ModuleRow title="Residents" detail="D1-backed list and search" status="Live" live />
                <ModuleRow title="Meals & kitchen" detail="Mapped from source; implementation next" status="Planned" />
                <ModuleRow title="Billing & closing" detail="Snapshot-only accounting model required" status="Planned" />
                <ModuleRow title="Payments & funds" detail="Canonical ledger path required" status="Planned" />
              </div>
            </article>
            <article className="panel glass-surface">
              <div className="panel-head"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Audit trail</h2></div><Activity size={20} /></div>
              <div className="activity-list">
                {(data?.recentActivity ?? []).map((item: any) => <div className="activity-row" key={item.id}><div className="activity-icon"><Activity size={15} /></div><div><strong>{item.actorName}</strong><span>{String(item.action).toLowerCase().replaceAll("_", " ")}</span><small>{new Date(item.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</small></div></div>)}
              </div>
            </article>
          </section>
        </>
      ) : (
        <section className="dashboard-grid resident-grid">
          <article className="panel glass-surface"><div className="panel-head"><div><span className="eyebrow">PROFILE</span><h2>Your resident profile</h2></div><UserRound size={20} /></div><div className="profile-details"><Detail label="Name" value={user.name} /><Detail label="Resident ID" value={user.institutionUserId ?? "—"} /><Detail label="Room" value={user.room ?? "—"} /><Detail label="Status" value={user.status} /></div></article>
          <article className="panel glass-surface"><div className="panel-head"><div><span className="eyebrow">COMING NEXT</span><h2>Resident services</h2></div><Sparkles size={20} /></div><div className="module-list"><ModuleRow title="Meal control" detail="Daily meal toggles and cutoff rules" status="Planned" /><ModuleRow title="Bills" detail="Snapshot-backed monthly charges" status="Planned" /><ModuleRow title="Payments" detail="Receipts and resident fund ledger" status="Planned" /></div></article>
        </section>
      )}
    </motion.div>
  );
}

function ModuleRow({ title, detail, status, live = false }: { title: string; detail: string; status: string; live?: boolean }) {
  return <div className="module-row"><div className={`module-icon ${live ? "module-live" : ""}`}>{live ? <CheckCircle2 size={17} /> : <LockKeyhole size={16} />}</div><div><strong>{title}</strong><span>{detail}</span></div><em className={live ? "status-live" : ""}>{status}</em></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>;
}

function Residents() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const residents = useQuery({
    queryKey: ["residents", search, status],
    queryFn: () => apiRequest<{ residents: any[] }>(`/residents?q=${encodeURIComponent(search)}&status=${status}`),
  });
  const rows = residents.data?.residents ?? [];
  const summary = useMemo(() => ({ active: rows.filter((r) => r.status === "ACTIVE").length, pending: rows.filter((r) => r.status === "PENDING").length }), [rows]);

  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="page-heading"><div><span className="eyebrow">PEOPLE</span><h1>Residents</h1><p>Live from local D1. Search by name, email, room, or resident ID.</p></div><div className="heading-stats"><span><strong>{rows.length}</strong> shown</span><span><strong>{summary.active}</strong> active</span><span><strong>{summary.pending}</strong> pending</span></div></section>
      <section className="toolbar glass-surface"><div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search residents…" /></div><div className="filter-tabs">{["ALL", "ACTIVE", "PENDING", "SUSPENDED"].map((value) => <button key={value} className={status === value ? "selected" : ""} onClick={() => setStatus(value)}>{value[0] + value.slice(1).toLowerCase()}</button>)}</div></section>
      {residents.isLoading ? <PageSkeleton /> : residents.error ? <ErrorPanel message={(residents.error as Error).message} onRetry={() => residents.refetch()} /> : (
        <section className="resident-panel glass-surface">
          <div className="resident-table-head"><span>Resident</span><span>Resident ID</span><span>Room</span><span>Status</span><span>Contact</span></div>
          <div className="resident-list">
            {rows.map((resident) => <div className="resident-row" key={resident.id}><div className="resident-person"><div className="avatar resident-avatar">{initials(resident.name)}</div><div><strong>{resident.name}</strong><span>{resident.email}</span></div></div><span data-label="Resident ID">{resident.institutionUserId ?? "—"}</span><span data-label="Room">{resident.room ?? "—"}</span><span data-label="Status"><i className={`status-badge status-${String(resident.status).toLowerCase()}`}>{resident.status}</i></span><span data-label="Contact">{resident.phone ?? "—"}</span></div>)}
            {rows.length === 0 && <div className="empty-state"><Search size={26} /><strong>No residents found</strong><span>Try a different search or status filter.</span></div>}
          </div>
        </section>
      )}
    </motion.div>
  );
}

function PageSkeleton() {
  return <div className="skeleton-stack"><div className="skeleton large" /><div className="kpi-grid">{[0,1,2,3].map((n) => <div className="skeleton kpi" key={n} />)}</div><div className="skeleton panel-skeleton" /></div>;
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-panel glass-surface"><ShieldCheck size={28} /><strong>Couldn’t load this view</strong><span>{message}</span><button onClick={onRetry}>Try again</button></div>;
}

export function App() {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => apiRequest<{ user: SessionUser }>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });

  if (session.isLoading) return <AppLoader />;
  if (!session.data?.user) return <LoginScreen />;
  return <Shell user={session.data.user} />;
}
