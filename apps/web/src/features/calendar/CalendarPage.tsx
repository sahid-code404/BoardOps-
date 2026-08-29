import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Archive, CalendarDays, Pencil, Plus, RefreshCw, ShieldCheck, Sparkles, Utensils, X } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "../../lib/api";

type Role = "ADMIN" | "USER";
type EventType = "HOLIDAY" | "FESTIVAL" | "SPECIAL_MEAL" | "BILLING_DAY" | "REFUND_DAY" | "MAINTENANCE";
type EventStatus = "ACTIVE" | "ARCHIVED";

type CalendarEvent = {
  id: string;
  name: string;
  description: string | null;
  type: EventType;
  startDate: string;
  endDate: string;
  mealsDisabled: boolean;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
};

type CalendarData = {
  from: string;
  to: string;
  timeZone: string;
  events: CalendarEvent[];
};

type EventPayload = {
  name: string;
  description: string | null;
  type: EventType;
  startDate: string;
  endDate: string;
  mealsDisabled: boolean;
};

const eventTypes: Array<{ value: EventType; label: string }> = [
  { value: "HOLIDAY", label: "Holiday" },
  { value: "FESTIVAL", label: "Festival" },
  { value: "SPECIAL_MEAL", label: "Special meal" },
  { value: "BILLING_DAY", label: "Billing day" },
  { value: "REFUND_DAY", label: "Refund day" },
  { value: "MAINTENANCE", label: "Maintenance" },
];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year!, month! - 1, day! + days);
  return dateKey(date);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(year!, month! - 1, day!));
}

function typeLabel(value: EventType) {
  return eventTypes.find((item) => item.value === value)?.label ?? value;
}

function EventError({ message, retry }: { message: string; retry: () => void }) {
  return <section className="calendar-error glass-surface"><ShieldCheck size={27} /><strong>Couldn’t load the institution calendar</strong><span>{message}</span><button onClick={retry}><RefreshCw size={15} /> Try again</button></section>;
}

export function CalendarPage({ user }: { user: { role: Role } }) {
  const today = useMemo(() => dateKey(new Date()), []);
  const from = useMemo(() => addDays(today, -30), [today]);
  const to = useMemo(() => addDays(today, 365), [today]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [filter, setFilter] = useState<"ALL" | EventType>("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<EventType>("HOLIDAY");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [mealsDisabled, setMealsDisabled] = useState(true);
  const queryClient = useQueryClient();

  const calendar = useQuery({
    queryKey: ["calendar-events", from, to, includeArchived],
    queryFn: () => apiRequest<CalendarData>(`/calendar/events?from=${from}&to=${to}${user.role === "ADMIN" && includeArchived ? "&includeArchived=true" : ""}`),
  });

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setType("HOLIDAY");
    setStartDate(today);
    setEndDate(today);
    setMealsDisabled(true);
  };

  const beginEdit = (event: CalendarEvent) => {
    setEditingId(event.id);
    setName(event.name);
    setDescription(event.description ?? "");
    setType(event.type);
    setStartDate(event.startDate);
    setEndDate(event.endDate);
    setMealsDisabled(event.mealsDisabled);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = useMutation({
    mutationFn: ({ id, payload }: { id: string | null; payload: EventPayload }) => apiRequest<{ id: string }>(id ? `/calendar/events/${id}` : "/calendar/events", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["meal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["kitchen"] });
      toast.success(variables.id ? "Calendar event updated" : "Calendar event created");
      resetForm();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: (id: string) => apiRequest<{ archived: boolean; changed: boolean }>(`/calendar/events/${id}`, { method: "DELETE", body: "{}" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["meal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["kitchen"] });
      toast.success("Calendar event archived");
      resetForm();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selected = editingId ? calendar.data?.events.find((event) => event.id === editingId) ?? null : null;
  const active = calendar.data?.events.filter((event) => event.status === "ACTIVE") ?? [];
  const filtered = (calendar.data?.events ?? []).filter((event) => filter === "ALL" || event.type === filter);
  const upcoming = active.filter((event) => event.endDate >= today).length;
  const closures = active.filter((event) => event.mealsDisabled && event.endDate >= today).length;
  const festivals = active.filter((event) => event.type === "FESTIVAL" && event.endDate >= today).length;

  const submit = () => {
    if (name.trim().length < 2) return toast.error("Enter an event name");
    if (!startDate || !endDate) return toast.error("Choose a start and end date");
    save.mutate({
      id: editingId,
      payload: {
        name: name.trim(),
        description: description.trim() || null,
        type,
        startDate,
        endDate,
        mealsDisabled,
      },
    });
  };

  return <motion.div className="page-stack calendar-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <section className="page-heading calendar-heading">
      <div><span className="eyebrow">INSTITUTION CALENDAR</span><h1>Calendar & holidays</h1><p>{user.role === "ADMIN" ? "Publish institution events and meal-service closures with reversible, audited rules." : "See upcoming institution events and the dates when meal service is unavailable."}</p></div>
      <div className="calendar-zone"><CalendarDays size={18} /><div><span>Calendar timezone</span><strong>{calendar.data?.timeZone ?? "Institution timezone"}</strong></div></div>
    </section>

    {user.role === "ADMIN" && <section className="calendar-editor glass-surface">
      <div className="panel-head"><div><span className="eyebrow">{editingId ? "EDIT EVENT" : "NEW EVENT"}</span><h2>{editingId ? name || "Calendar event" : "Publish calendar event"}</h2>{selected?.mealsDisabled && <p className="panel-subcopy">Meal-impacting dates are locked after publication. Archive and recreate the event to change that rule safely.</p>}</div>{editingId ? <button className="calendar-close-edit" onClick={resetForm}><X size={17} /> Cancel edit</button> : <Sparkles size={20} />}</div>
      <div className="calendar-form-grid">
        <label className="calendar-field wide"><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Founders Day" /></label>
        <label className="calendar-field"><span>Type</span><select value={type} onChange={(event) => setType(event.target.value as EventType)}>{eventTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label className="calendar-field"><span>Start</span><input disabled={Boolean(selected?.mealsDisabled)} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="calendar-field"><span>End</span><input disabled={Boolean(selected?.mealsDisabled)} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        <label className="calendar-field calendar-description"><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional event note" /></label>
        <label className={`meal-impact-toggle ${mealsDisabled ? "active" : ""}`}><input disabled={Boolean(editingId)} type="checkbox" checked={mealsDisabled} onChange={(event) => setMealsDisabled(event.target.checked)} /><span className="meal-impact-switch"><i /></span><div><strong>Disable meal service</strong><small>Residents and guest meals are blocked for this date range.</small></div></label>
        <button className="primary-button calendar-save" disabled={save.isPending} onClick={submit}>{save.isPending ? "Saving…" : editingId ? "Save changes" : "Publish event"}<Plus size={16} /></button>
      </div>
    </section>}

    {calendar.isLoading ? <div className="calendar-skeletons">{[0, 1, 2].map((item) => <div className="skeleton calendar-skeleton" key={item} />)}</div> : calendar.error ? <EventError message={(calendar.error as Error).message} retry={() => calendar.refetch()} /> : <>
      <section className="calendar-kpis">
        <article className="glass-surface"><CalendarDays size={19} /><div><span>Upcoming</span><strong>{upcoming}</strong><small>active calendar events</small></div></article>
        <article className="glass-surface"><Utensils size={19} /><div><span>Meal closures</span><strong>{closures}</strong><small>future active rules</small></div></article>
        <article className="glass-surface"><Sparkles size={19} /><div><span>Festivals</span><strong>{festivals}</strong><small>upcoming festival events</small></div></article>
      </section>

      <section className="calendar-list-panel glass-surface">
        <div className="calendar-toolbar"><div><span className="eyebrow">AGENDA</span><h2>Institution events</h2></div><div className="calendar-filters"><select value={filter} onChange={(event) => setFilter(event.target.value as "ALL" | EventType)}><option value="ALL">All event types</option>{eventTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select>{user.role === "ADMIN" && <label><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Show archived</label>}</div></div>
        <div className="calendar-event-list">{filtered.length === 0 ? <div className="calendar-empty"><CalendarDays size={27} /><strong>No events in this range</strong><span>Published holidays and institution events will appear here.</span></div> : filtered.map((event) => <article className={`calendar-event-row ${event.status === "ARCHIVED" ? "archived" : ""}`} key={event.id}>
          <div className={`calendar-type-mark type-${event.type.toLowerCase().replaceAll("_", "-")}`}><CalendarDays size={18} /></div>
          <div className="calendar-event-copy"><div className="calendar-event-title"><strong>{event.name}</strong><span>{typeLabel(event.type)}</span>{event.mealsDisabled && <em><Utensils size={12} /> Meals off</em>}{event.status === "ARCHIVED" && <em className="archived-pill">Archived</em>}</div><p>{event.description || "No additional description."}</p><small>{formatDate(event.startDate)}{event.endDate !== event.startDate ? ` → ${formatDate(event.endDate)}` : ""}</small></div>
          {user.role === "ADMIN" && event.status === "ACTIVE" && <div className="calendar-row-actions"><button onClick={() => beginEdit(event)}><Pencil size={15} /> Edit</button><button className="danger" disabled={archive.isPending} onClick={() => archive.mutate(event.id)}><Archive size={15} /> {archive.isPending ? "Archiving…" : "Archive"}</button></div>}
        </article>)}</div>
      </section>
    </>}
  </motion.div>;
}
