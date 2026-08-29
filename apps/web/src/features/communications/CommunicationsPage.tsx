import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Archive,
  BellRing,
  CheckCircle2,
  Clock3,
  FileText,
  Megaphone,
  Pin,
  PinOff,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "../../lib/api";

type Role = "ADMIN" | "USER";
type AnnouncementType = "INFO" | "WARNING" | "MAINTENANCE" | "EVENT";
type Priority = "NORMAL" | "HIGH" | "URGENT";
type Audience = "ALL" | "RESIDENTS" | "ADMINS";
type Status = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

type Announcement = {
  id: string;
  title: string;
  body: string;
  type: AnnouncementType;
  priority: Priority;
  targetAudience: Audience;
  isPinned: boolean;
  status: Status;
  publishedAt: string | null;
  scheduledFor: string | null;
  expiresAt: string | null;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
};

type AnnouncementData = { announcements: Announcement[] };

type OutboxEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  dedupeKey: string;
  status: "PENDING" | "DISPATCHED" | "FAILED";
  attempts: number;
  availableAt: string;
  dispatchedAt: string | null;
  lastError: string | null;
  createdAt: string;
};

const types: Array<{ value: AnnouncementType; label: string }> = [
  { value: "INFO", label: "Information" },
  { value: "WARNING", label: "Warning" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "EVENT", label: "Event" },
];

const priorities: Priority[] = ["NORMAL", "HIGH", "URGENT"];
const audiences: Array<{ value: Audience; label: string }> = [
  { value: "ALL", label: "Everyone" },
  { value: "RESIDENTS", label: "Residents" },
  { value: "ADMINS", label: "Administrators" },
];

function formatWhen(value: string | null, fallback: string) {
  const source = value ?? fallback;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(source));
}

function statusLabel(status: Status) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function FeedError({ message, retry }: { message: string; retry: () => void }) {
  return <section className="communications-error glass-surface"><ShieldCheck size={27} /><strong>Couldn’t load announcements</strong><span>{message}</span><button onClick={retry}><RefreshCw size={15} /> Try again</button></section>;
}

export function CommunicationsPage({ user }: { user: { role: Role } }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"ALL" | Status>("ALL");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<AnnouncementType>("INFO");
  const [priority, setPriority] = useState<Priority>("NORMAL");
  const [audience, setAudience] = useState<Audience>("ALL");
  const [isPinned, setPinned] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [publishNow, setPublishNow] = useState(true);

  const announcements = useQuery({
    queryKey: ["announcements", user.role, statusFilter],
    queryFn: () => apiRequest<AnnouncementData>(`/announcements${user.role === "ADMIN" && statusFilter !== "ALL" ? `?status=${statusFilter}` : ""}`),
  });

  const outbox = useQuery({
    queryKey: ["communications-outbox"],
    queryFn: () => apiRequest<{ events: OutboxEvent[] }>("/communications/outbox?status=PENDING"),
    enabled: user.role === "ADMIN",
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["announcements"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["communications-outbox"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const create = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        type,
        priority,
        targetAudience: audience,
        isPinned,
        status: publishNow ? "PUBLISHED" : "DRAFT",
      };
      if (expiresAt) payload.expiresAt = new Date(expiresAt).toISOString();
      return apiRequest<{ id: string; status: Status }>("/announcements", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: ({ status }) => {
      refresh();
      toast.success(status === "PUBLISHED" ? "Announcement published" : "Draft saved");
      setTitle("");
      setBody("");
      setType("INFO");
      setPriority("NORMAL");
      setAudience("ALL");
      setPinned(true);
      setExpiresAt("");
      setPublishNow(true);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patch = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => apiRequest<{ id: string; status: Status; isPinned?: boolean }>(`/announcements/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
    onSuccess: (_, variables) => {
      refresh();
      toast.success(variables.payload.status === "PUBLISHED" ? "Announcement published" : "Announcement updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: (id: string) => apiRequest<{ archived: boolean; changed: boolean }>(`/announcements/${id}`, { method: "DELETE", body: "{}" }),
    onSuccess: () => { refresh(); toast.success("Announcement archived"); },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = announcements.data?.announcements ?? [];
  const live = items.filter((item) => item.status === "PUBLISHED");
  const pinned = live.filter((item) => item.isPinned).length;
  const urgent = live.filter((item) => item.priority === "URGENT").length;
  const pendingOutbox = outbox.data?.events.length ?? 0;

  const canSubmit = title.trim().length >= 3 && body.trim().length >= 5 && !create.isPending;

  return <motion.div className="page-stack communications-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <section className="page-heading communications-heading">
      <div><span className="eyebrow">COMMUNICATIONS</span><h1>Announcements</h1><p>{user.role === "ADMIN" ? "Publish targeted updates with durable in-app fan-out and an auditable delivery outbox." : "Institution notices, service updates and important resident announcements in one place."}</p></div>
      <div className="communications-heading-badge"><Megaphone size={18} /><div><span>Audience</span><strong>{user.role === "ADMIN" ? "Publisher view" : "Resident feed"}</strong></div></div>
    </section>

    {user.role === "ADMIN" && <section className="announcement-composer glass-surface">
      <div className="panel-head"><div><span className="eyebrow">PUBLISHER</span><h2>Create announcement</h2><p className="panel-subcopy">Published content becomes immutable. Issue corrections by archiving and publishing a new notice.</p></div><Sparkles size={20} /></div>
      <div className="announcement-form">
        <label className="announcement-field title"><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="What should people know?" /></label>
        <label className="announcement-field body"><span>Message</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={5} placeholder="Write the operational update clearly…" /></label>
        <div className="announcement-form-grid">
          <label className="announcement-field"><span>Type</span><select value={type} onChange={(event) => setType(event.target.value as AnnouncementType)}>{types.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
          <label className="announcement-field"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{priorities.map((item) => <option value={item} key={item}>{item.charAt(0) + item.slice(1).toLowerCase()}</option>)}</select></label>
          <label className="announcement-field"><span>Audience</span><select value={audience} onChange={(event) => setAudience(event.target.value as Audience)}>{audiences.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
          <label className="announcement-field"><span>Expires (optional)</span><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
        </div>
        <div className="announcement-options">
          <label className={`announcement-toggle ${isPinned ? "active" : ""}`}><input type="checkbox" checked={isPinned} onChange={(event) => setPinned(event.target.checked)} /><span><Pin size={15} /> Pin in feed</span></label>
          <label className={`announcement-toggle ${publishNow ? "active" : ""}`}><input type="checkbox" checked={publishNow} onChange={(event) => setPublishNow(event.target.checked)} /><span><Send size={15} /> Publish now</span></label>
          <small>{publishNow ? "Creates targeted in-app notifications atomically." : "Saved as a draft; publish it from the feed later."}</small>
        </div>
        <button className="primary-button announcement-submit" disabled={!canSubmit} onClick={() => create.mutate()}>{create.isPending ? "Saving…" : publishNow ? "Publish announcement" : "Save draft"}{publishNow ? <Send size={16} /> : <FileText size={16} />}</button>
      </div>
    </section>}

    {!announcements.isLoading && !announcements.error && <section className="communications-kpis">
      <article className="glass-surface"><Megaphone size={19} /><div><span>Published</span><strong>{live.length}</strong><small>visible notices</small></div></article>
      <article className="glass-surface"><Pin size={19} /><div><span>Pinned</span><strong>{pinned}</strong><small>prominent notices</small></div></article>
      <article className="glass-surface"><BellRing size={19} /><div><span>Urgent</span><strong>{urgent}</strong><small>published urgent notices</small></div></article>
      {user.role === "ADMIN" && <article className="glass-surface"><Clock3 size={19} /><div><span>Outbox</span><strong>{pendingOutbox}</strong><small>pending external dispatch</small></div></article>}
    </section>}

    {announcements.isLoading ? <div className="communication-skeletons">{[0, 1, 2].map((item) => <div className="skeleton communication-skeleton" key={item} />)}</div>
      : announcements.error ? <FeedError message={(announcements.error as Error).message} retry={() => announcements.refetch()} />
      : <section className="announcement-feed glass-surface">
        <div className="communications-toolbar"><div><span className="eyebrow">FEED</span><h2>{user.role === "ADMIN" ? "Announcement history" : "Institution notices"}</h2></div>{user.role === "ADMIN" && <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ALL" | Status)}><option value="ALL">All statuses</option><option value="PUBLISHED">Published</option><option value="DRAFT">Drafts</option><option value="SCHEDULED">Scheduled</option><option value="ARCHIVED">Archived</option></select>}</div>
        <div className="announcement-list">{items.length === 0 ? <div className="announcement-empty"><Megaphone size={28} /><strong>No announcements here</strong><span>{user.role === "ADMIN" ? "Publish a notice or change the status filter." : "New institution notices will appear here."}</span></div> : items.map((item) => <AnnouncementCard key={item.id} item={item} admin={user.role === "ADMIN"} patch={(payload) => patch.mutate({ id: item.id, payload })} archive={() => archive.mutate(item.id)} pending={patch.isPending || archive.isPending} />)}</div>
      </section>}

    {user.role === "ADMIN" && <section className="outbox-note glass-surface"><ShieldCheck size={20} /><div><strong>Durable delivery boundary</strong><span>Publishing writes the announcement, recipient notifications, audit event and a deduplicated D1 outbox record together. External Queue/email/push dispatch is intentionally not claimed in this checkpoint.</span></div><em>{pendingOutbox} pending</em></section>}
  </motion.div>;
}

function AnnouncementCard({ item, admin, patch, archive, pending }: { item: Announcement; admin: boolean; patch: (payload: Record<string, unknown>) => void; archive: () => void; pending: boolean }) {
  const published = item.status === "PUBLISHED";
  const audience = audiences.find((entry) => entry.value === item.targetAudience)?.label ?? item.targetAudience;
  return <article className={`announcement-card announcement-${item.type.toLowerCase()} priority-${item.priority.toLowerCase()} ${item.status.toLowerCase()}`}>
    <div className="announcement-card-mark">{item.type === "WARNING" ? <ShieldCheck size={19} /> : item.type === "MAINTENANCE" ? <Clock3 size={19} /> : item.type === "EVENT" ? <Sparkles size={19} /> : <Megaphone size={19} />}</div>
    <div className="announcement-card-content">
      <div className="announcement-card-title"><strong>{item.title}</strong>{item.isPinned && <span className="pinned-badge"><Pin size={11} /> Pinned</span>}<span className={`priority-badge ${item.priority.toLowerCase()}`}>{item.priority}</span>{admin && <span className={`status-badge ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span>}</div>
      <p>{item.body}</p>
      <div className="announcement-meta"><span><Users size={13} /> {audience}</span><span><Clock3 size={13} /> {formatWhen(item.publishedAt, item.createdAt)}</span><span>By {item.creatorName}</span>{item.expiresAt && <span>Expires {formatWhen(item.expiresAt, item.expiresAt)}</span>}</div>
    </div>
    {admin && item.status !== "ARCHIVED" && <div className="announcement-actions">
      {!published && <button className="publish" disabled={pending} onClick={() => patch({ status: "PUBLISHED" })}><Send size={14} /> Publish</button>}
      <button disabled={pending} onClick={() => patch({ isPinned: !item.isPinned })}>{item.isPinned ? <PinOff size={14} /> : <Pin size={14} />}{item.isPinned ? "Unpin" : "Pin"}</button>
      <button className="danger" disabled={pending} onClick={() => { if (window.confirm(`Archive “${item.title}”? It will disappear from resident feeds, but history remains.`)) archive(); }}><Archive size={14} /> Archive</button>
    </div>}
    {published && !admin && <div className="announcement-published"><CheckCircle2 size={14} /> Published</div>}
  </article>;
}
