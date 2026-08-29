import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  DoorOpen,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Megaphone,
  Menu,
  Receipt,
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
import { CalendarPage } from "../features/calendar/CalendarPage";
import { CommunicationsPage } from "../features/communications/CommunicationsPage";
import { NotificationBell } from "../features/communications/NotificationBell";
import { MealsPage } from "../features/meals/MealsPage";
import { PaymentsPage } from "../features/payments/PaymentsPage";
import { ResidentsPage } from "../features/residents/ResidentsPage";
import { apiRequest } from "../lib/api";

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

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "USER"] as Role[], live: true },
  { to: "/residents", label: "Residents", icon: Users, roles: ["ADMIN"] as Role[], live: true },
  { to: "/meals", label: "Meals", icon: Utensils, roles: ["ADMIN", "USER"] as Role[], live: true },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, roles: ["ADMIN", "USER"] as Role[], live: true },
  { to: "/announcements", label: "Announcements", icon: Megaphone, roles: ["ADMIN", "USER"] as Role[], live: true },
  { to: "/billing", label: "Billing", icon: Wallet, roles: ["ADMIN", "USER"] as Role[], live: false },
  { to: "/payments", label: "Payments", icon: CreditCard, roles: ["ADMIN", "USER"] as Role[], live: true },
  { to: "/expenses", label: "Expenses", icon: Receipt, roles: ["ADMIN"] as Role[], live: false },
  { to: "/closing", label: "Monthly Closing", icon: CalendarCheck, roles: ["ADMIN"] as Role[], live: false },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["ADMIN"] as Role[], live: false },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["ADMIN"] as Role[], live: false },
];

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function dateLabel() {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
}

function AppLoader() {
  return <div className="boot-screen"><div className="brand-mark"><Sparkles size={22} /></div><div><strong>BoardOps</strong><span>Loading local workspace…</span></div></div>;
}

function LoginScreen() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("admin@boardops.local");
  const [password, setPassword] = useState("boardops-demo");
  const login = useMutation({
    mutationFn: () => apiRequest<{ user: SessionUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(["session"], { user });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(`Welcome back, ${user.name.split(" ")[0]}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return <main className="auth-shell">
    <div className="mesh mesh-one" /><div className="mesh mesh-two" />
    <motion.section className="auth-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <div className="auth-brand"><div className="brand-mark"><Sparkles size={20} /></div><div><strong>BoardOps</strong><span>Institution operations, rebuilt correctly</span></div></div>
      <div className="auth-copy"><span className="eyebrow">LOCAL DEVELOPMENT CHECKPOINT</span><h1>Welcome back.</h1><p>Sign in to test resident lifecycle, meals, leave, calendar, announcements, notifications and the canonical resident-fund ledger against local D1.</p></div>
      <form className="login-form" onSubmit={(event) => { event.preventDefault(); login.mutate(); }}>
        <label><span>Email</span><div className="input-wrap"><UserRound size={18} /><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" /></div></label>
        <label><span>Password</span><div className="input-wrap"><LockKeyhole size={18} /><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" /></div></label>
        <button className="primary-button" disabled={login.isPending} type="submit">{login.isPending ? "Signing in…" : "Sign in"}<ArrowRight size={18} /></button>
      </form>
      <div className="demo-box"><ShieldCheck size={18} /><div><strong>Development-only credentials</strong><span>Admin: admin@boardops.local · Resident: arjun@boardops.local</span><span>Password for both: boardops-demo</span></div></div>
      <div className="auth-foot"><span><CheckCircle2 size={14} /> HttpOnly local session</span><span><CheckCircle2 size={14} /> D1-backed data</span></div>
    </motion.section>
  </main>;
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
    onSuccess: () => { queryClient.clear(); navigate("/"); },
  });

  return <div className="workspace-shell">
    <aside className="sidebar">
      <div className="sidebar-brand"><div className="brand-mark small"><Sparkles size={17} /></div><div><strong>BoardOps</strong><span>{user.institutionName}</span></div></div>
      <nav className="side-nav"><p className="nav-caption">Workspace</p>{visibleNav.map((item) => {
        const Icon = item.icon;
        return item.live
          ? <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon size={18} /><span>{item.label}</span><ChevronRight size={15} className="nav-chevron" /></NavLink>
          : <button key={item.to} className="nav-item disabled-nav" onClick={() => toast.info(`${item.label} is scheduled for a later migration phase`)}><Icon size={18} /><span>{item.label}</span><span className="soon-dot" /></button>;
      })}</nav>
      <div className="sidebar-foot"><div className="mini-profile"><div className="avatar">{initials(user.name)}</div><div><strong>{user.name}</strong><span>{user.role === "ADMIN" ? "Administrator" : user.room ?? "Resident"}</span></div></div><button className="icon-button" aria-label="Sign out" onClick={() => logout.mutate()}><LogOut size={18} /></button></div>
    </aside>

    <div className="workspace-main">
      <header className="topbar">
        <div className="topbar-title"><button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div><span>BoardOps</span><strong>{activeLabel}</strong></div></div>
        <div className="topbar-actions"><NotificationBell /><div className="top-avatar">{initials(user.name)}</div></div>
      </header>
      <main className="content-area">
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/residents" element={user.role === "ADMIN" ? <ResidentsPage /> : <Navigate to="/" replace />} />
          <Route path="/meals" element={<MealsPage user={user} />} />
          <Route path="/calendar" element={<CalendarPage user={user} />} />
          <Route path="/announcements" element={<CommunicationsPage user={user} />} />
          <Route path="/payments" element={<PaymentsPage user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>

    <AnimatePresence>{mobileOpen && <>
      <motion.button className="mobile-overlay" aria-label="Close navigation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
      <motion.aside className="mobile-drawer" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 320, damping: 32 }}>
        <div className="drawer-head"><div className="sidebar-brand"><div className="brand-mark small"><Sparkles size={17} /></div><div><strong>BoardOps</strong><span>{user.institutionName}</span></div></div><button className="icon-button" onClick={() => setMobileOpen(false)}><X size={19} /></button></div>
        <nav className="side-nav">{visibleNav.map((item) => {
          const Icon = item.icon;
          return item.live
            ? <NavLink key={item.to} to={item.to} end={item.to === "/"} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon size={18} /><span>{item.label}</span></NavLink>
            : <button key={item.to} className="nav-item disabled-nav" onClick={() => toast.info(`${item.label} is scheduled for a later migration phase`)}><Icon size={18} /><span>{item.label}</span><span className="soon-dot" /></button>;
        })}</nav>
      </motion.aside>
    </>}</AnimatePresence>
  </div>;
}

function Dashboard({ user }: { user: SessionUser }) {
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => apiRequest<any>("/dashboard") });
  if (dashboard.isLoading) return <PageSkeleton />;
  if (dashboard.error) return <ErrorPanel message={(dashboard.error as Error).message} onRetry={() => dashboard.refetch()} />;
  const data = dashboard.data;
  const adminKpis = [
    { label: "Active Residents", value: data?.kpis?.activeResidents ?? 0, icon: Users, hint: "currently active" },
    { label: "Pending Reviews", value: data?.kpis?.pendingResidents ?? 0, icon: Activity, hint: "need attention" },
    { label: "Occupied Rooms", value: data?.kpis?.occupiedRooms ?? 0, icon: DoorOpen, hint: "active resident rooms" },
    { label: "Suspended", value: data?.kpis?.suspendedResidents ?? 0, icon: ShieldCheck, hint: "restricted accounts" },
  ];

  return <motion.div className="page-stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <section className="welcome-card glass-surface"><div><p>{dateLabel()}</p><h1>{greeting()}, <span>{user.name.split(" ")[0]}</span> <span className="wave">👋</span></h1><small>{user.role === "ADMIN" ? "Your BoardOps workspace is ready." : `Resident workspace · ${user.room ?? "Room not assigned"}`}</small></div><div className="phase-pill"><span className="live-dot" />Operations + canonical payments checkpoint</div></section>
    {user.role === "ADMIN" ? <>
      <section className="kpi-grid">{adminKpis.map(({ label, value, icon: Icon, hint }) => <motion.article whileHover={{ y: -3 }} key={label} className="kpi-card glass-surface"><div className="kpi-icon"><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></motion.article>)}</section>
      <section className="dashboard-grid">
        <article className="panel glass-surface"><div className="panel-head"><div><span className="eyebrow">MIGRATION STATUS</span><h2>BoardOps modules</h2></div><Building2 size={20} /></div><div className="module-list">
          <ModuleRow title="Residents & registration review" detail="D1 profile, lifecycle, review and audit history" status="Live" live />
          <ModuleRow title="Meals & kitchen" detail="Daily meal engine, presets, leave and guest demand" status="Live" live />
          <ModuleRow title="Calendar & holidays" detail="Typed institution events with audited meal-service rules" status="Live" live />
          <ModuleRow title="Announcements & notifications" detail="Targeted notices, in-app fan-out and durable outbox" status="Live" live />
          <ModuleRow title="Payments & funds" detail="Integer minor units, idempotent posting and immutable ledger reversals" status="Live" live />
          <ModuleRow title="Billing & closing" detail="Snapshot-only accounting model required" status="Planned" />
        </div></article>
        <article className="panel glass-surface"><div className="panel-head"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Audit trail</h2></div><Activity size={20} /></div><div className="activity-list">{(data?.recentActivity ?? []).map((item: any) => <div className="activity-row" key={item.id}><div className="activity-icon"><Activity size={15} /></div><div><strong>{item.actorName}</strong><span>{String(item.action).toLowerCase().replaceAll("_", " ")}</span><small>{new Date(item.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</small></div></div>)}</div></article>
      </section>
    </> : <section className="dashboard-grid resident-grid">
      <article className="panel glass-surface"><div className="panel-head"><div><span className="eyebrow">PROFILE</span><h2>Your resident profile</h2></div><UserRound size={20} /></div><div className="profile-details"><Detail label="Name" value={user.name} /><Detail label="Resident ID" value={user.institutionUserId ?? "—"} /><Detail label="Room" value={user.room ?? "—"} /><Detail label="Status" value={user.status} /></div></article>
      <article className="panel glass-surface"><div className="panel-head"><div><span className="eyebrow">RESIDENT SERVICES</span><h2>Your BoardOps tools</h2></div><Sparkles size={20} /></div><div className="module-list">
        <ModuleRow title="Meal control" detail="Daily toggles, presets and leave with server-enforced cutoffs" status="Live" live />
        <ModuleRow title="Institution calendar" detail="Upcoming events and meal-service closures" status="Live" live />
        <ModuleRow title="Announcements" detail="Published institution notices with personal notifications" status="Live" live />
        <ModuleRow title="Payments" detail="Immutable receipts and your canonical resident fund ledger" status="Live" live />
        <ModuleRow title="Bills" detail="Snapshot-backed monthly charges" status="Planned" />
      </div></article>
    </section>}
  </motion.div>;
}

function ModuleRow({ title, detail, status, live = false }: { title: string; detail: string; status: string; live?: boolean }) {
  return <div className="module-row"><div className={`module-icon ${live ? "module-live" : ""}`}>{live ? <CheckCircle2 size={17} /> : <LockKeyhole size={16} />}</div><div><strong>{title}</strong><span>{detail}</span></div><em className={live ? "status-live" : ""}>{status}</em></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>;
}

function PageSkeleton() {
  return <div className="skeleton-stack"><div className="skeleton large" /><div className="kpi-grid">{[0, 1, 2, 3].map((number) => <div className="skeleton kpi" key={number} />)}</div><div className="skeleton panel-skeleton" /></div>;
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-panel glass-surface"><ShieldCheck size={28} /><strong>Couldn’t load this view</strong><span>{message}</span><button onClick={onRetry}>Try again</button></div>;
}

export function App() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => apiRequest<{ user: SessionUser }>("/auth/me"), retry: false, staleTime: 60_000 });
  if (session.isLoading) return <AppLoader />;
  if (!session.data?.user) return <LoginScreen />;
  return <Shell user={session.data.user} />;
}
