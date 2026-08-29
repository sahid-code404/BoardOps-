import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  ChefHat,
  Clock3,
  ClipboardList,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Utensils,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "../../lib/api";

type Viewer = {
  id: string;
  name: string;
  role: "ADMIN" | "USER";
  room: string | null;
};

type MealStatus = "ON" | "OFF" | "LOCKED";

type MealConfig = {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  icon: string;
  color: string;
  startTime: string;
  endTime: string;
  cutoffStrategy: "PREVIOUS_DAY" | "SAME_DAY" | "CUSTOM_OFFSET";
  cutoffTime: string;
  status: "ACTIVE" | "ARCHIVED";
};

type MealEntry = {
  id: string;
  mealId: string;
  serviceDate: string;
  status: MealStatus;
  originalState: "ON" | "OFF";
  locked: boolean;
  overridden: boolean;
  editableUntil: string;
  displayName: string;
  name: string;
  icon: string;
  color: string;
  startTime: string;
  endTime: string;
  cutoffStrategy: "PREVIOUS_DAY" | "SAME_DAY" | "CUSTOM_OFFSET";
  cutoffTime: string;
};

type MealPreset = {
  id: string;
  name: string;
  description: string | null;
  items: Array<{ presetId: string; mealId: string; desiredState: "ON" | "OFF"; mealName: string; mealIcon: string }>;
};

type KitchenData = {
  access: true;
  date: string;
  timeZone: string;
  activeUsers: number;
  confirmedMeals: number;
  openChoices: number;
  counts: Array<{
    id: string;
    name: string;
    displayName: string;
    icon: string;
    color: string;
    startTime: string;
    endTime: string;
    on: number;
    off: number;
    open: number;
    total: number;
  }>;
  userMealStatus: Array<{
    userId: string;
    name: string;
    room: string | null;
    meals: Array<{ mealId: string; mealName: string; status: MealStatus; locked: boolean; confirmed: boolean }>;
  }>;
};

type GuestData = {
  date: string;
  entries: Array<{
    id: string;
    mealId: string;
    serviceDate: string;
    guestCount: number;
    guestName: string | null;
    notes: string | null;
    createdAt: string;
    mealName: string;
    mealIcon: string;
  }>;
  totals: Array<{ mealId: string; guests: number }>;
  totalGuests: number;
};

type LeaveApplication = {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  reason: string;
  mealType: "ALL" | "SPECIFIC";
  mealIds: string[];
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNotes: string | null;
  decidedAt: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
  room: string | null;
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return new Date(year, month - 1, day);
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(dateFromKey(value));
}

function formatCutoff(value: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function statusOn(status: MealStatus) {
  return status === "ON" || status === "LOCKED";
}

function PageError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="meal-error glass-surface"><ShieldCheck size={26} /><strong>Couldn’t load meals</strong><span>{message}</span><button onClick={retry}><RefreshCw size={15} /> Try again</button></div>;
}

export function MealsPage({ user }: { user: Viewer }) {
  const today = useMemo(() => dateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const queryClient = useQueryClient();
  const dateOptions = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 8 }, (_, index) => {
      const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + index - 1);
      return dateKey(date);
    });
  }, []);

  const configs = useQuery({
    queryKey: ["meal-config"],
    queryFn: () => apiRequest<{ meals: MealConfig[] }>("/meals/config"),
  });

  const residentEntries = useQuery({
    queryKey: ["meal-entries", selectedDate],
    queryFn: () => apiRequest<{ date: string; timeZone: string; meals: MealEntry[] }>(`/meals/entries?date=${selectedDate}`),
    enabled: user.role === "USER",
  });

  const presets = useQuery({
    queryKey: ["meal-presets"],
    queryFn: () => apiRequest<{ presets: MealPreset[] }>("/meals/presets"),
    enabled: user.role === "USER",
  });

  const kitchen = useQuery({
    queryKey: ["kitchen", selectedDate],
    queryFn: () => apiRequest<KitchenData>(`/kitchen?date=${selectedDate}`),
    enabled: user.role === "ADMIN",
  });

  const guests = useQuery({
    queryKey: ["kitchen-guests", selectedDate],
    queryFn: () => apiRequest<GuestData>(`/kitchen/guests?date=${selectedDate}`),
    enabled: user.role === "ADMIN",
  });

  const leave = useQuery({
    queryKey: ["leave"],
    queryFn: () => apiRequest<{ applications: LeaveApplication[] }>("/leave"),
  });

  const refreshMeals = () => {
    queryClient.invalidateQueries({ queryKey: ["meal-entries", selectedDate] });
    queryClient.invalidateQueries({ queryKey: ["kitchen", selectedDate] });
  };

  const toggle = useMutation({
    mutationFn: ({ entryId, status }: { entryId: string; status: "ON" | "OFF" }) => apiRequest<{ changed: boolean; status?: string }>("/meals/toggle", {
      method: "PATCH",
      body: JSON.stringify({ entryId, status }),
    }),
    onSuccess: refreshMeals,
    onError: (error: Error) => toast.error(error.message),
  });

  const applyPreset = useMutation({
    mutationFn: (presetId: string) => apiRequest<{ changed: string[]; skippedLocked: string[] }>("/meals/presets/apply", {
      method: "POST",
      body: JSON.stringify({ presetId, serviceDate: selectedDate }),
    }),
    onSuccess: ({ changed, skippedLocked }) => {
      refreshMeals();
      if (changed.length > 0) toast.success("Meal preset applied");
      else if (skippedLocked.length > 0) toast.info("Preset could not change locked meals");
      else toast.info("Meals already match this preset");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const override = useMutation({
    mutationFn: (input: { userId: string; mealId: string; action: "TURN_ON" | "TURN_OFF"; reason: string }) => apiRequest<{ changed: boolean }>("/meals/override", {
      method: "POST",
      body: JSON.stringify({ ...input, serviceDate: selectedDate }),
    }),
    onSuccess: ({ changed }) => {
      refreshMeals();
      toast.success(changed ? "Administrator override applied" : "Meal already has that effective state");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addGuest = useMutation({
    mutationFn: (input: { mealId: string; guestCount: number; guestName?: string; notes?: string }) => apiRequest<{ id: string }>("/kitchen/guests", {
      method: "POST",
      body: JSON.stringify({ ...input, serviceDate: selectedDate }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kitchen-guests", selectedDate] });
      toast.success("Guest meal added");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelGuest = useMutation({
    mutationFn: (id: string) => apiRequest<{ cancelled: boolean }>(`/kitchen/guests/${id}`, { method: "DELETE", body: JSON.stringify({}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kitchen-guests", selectedDate] });
      toast.success("Guest meal cancelled");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createLeave = useMutation({
    mutationFn: (input: { startDate: string; endDate: string; reason: string; mealType: "ALL" | "SPECIFIC"; mealIds: string[] }) => apiRequest<{ id: string }>("/leave", {
      method: "POST",
      body: JSON.stringify(input),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave"] });
      toast.success("Leave application submitted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const decideLeave = useMutation({
    mutationFn: (input: { id: string; status: "APPROVED" | "REJECTED"; adminNotes?: string }) => apiRequest<{ status: string; affectedMealEntries: number }>(`/leave/${input.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: input.status, adminNotes: input.adminNotes }),
    }),
    onSuccess: ({ status, affectedMealEntries }) => {
      queryClient.invalidateQueries({ queryKey: ["leave"] });
      refreshMeals();
      toast.success(status === "APPROVED" ? `Leave approved · ${affectedMealEntries} meal choices updated` : "Leave rejected");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const loading = configs.isLoading || leave.isLoading || (user.role === "USER" ? residentEntries.isLoading : kitchen.isLoading || guests.isLoading);
  const error = configs.error || leave.error || (user.role === "USER" ? residentEntries.error : kitchen.error || guests.error);

  return (
    <motion.div className="page-stack meals-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="page-heading meal-heading">
        <div><span className="eyebrow">MEALS</span><h1>{user.role === "ADMIN" ? "Kitchen & meal operations" : "My meals"}</h1><p>{user.role === "ADMIN" ? "Confirmed demand, locked-state overrides, guests and leave approvals are managed from one operational view." : "Choose meals before cutoff, apply presets, and submit leave without losing the audit trail."}</p></div>
        <div className="meal-date-current"><CalendarDays size={17} /><div><span>Selected day</span><strong>{dayLabel(selectedDate)}</strong></div></div>
      </section>

      <section className="meal-date-strip glass-surface">
        {dateOptions.map((date) => <button key={date} className={selectedDate === date ? "selected" : ""} onClick={() => setSelectedDate(date)}><span>{date === today ? "Today" : new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(dateFromKey(date))}</span><strong>{dateFromKey(date).getDate()}</strong></button>)}
      </section>

      {loading ? <div className="meal-loading-grid">{[0, 1, 2].map((item) => <div key={item} className="skeleton meal-skeleton" />)}</div> : error ? <PageError message={(error as Error).message} retry={() => { configs.refetch(); leave.refetch(); user.role === "ADMIN" ? Promise.all([kitchen.refetch(), guests.refetch()]) : Promise.all([residentEntries.refetch(), presets.refetch()]); }} /> : user.role === "ADMIN" ? (
        <AdminKitchen
          data={kitchen.data!}
          guests={guests.data!}
          configs={configs.data?.meals ?? []}
          leaves={leave.data?.applications ?? []}
          selectedDate={selectedDate}
          overrideMeal={(input) => override.mutate(input)}
          overridePending={override.isPending}
          addGuest={(input) => addGuest.mutate(input)}
          guestPending={addGuest.isPending}
          cancelGuest={(id) => cancelGuest.mutate(id)}
          cancelGuestPending={cancelGuest.isPending}
          decideLeave={(input) => decideLeave.mutate(input)}
          leavePending={decideLeave.isPending}
        />
      ) : (
        <ResidentArea
          entries={residentEntries.data?.meals ?? []}
          presets={presets.data?.presets ?? []}
          configs={configs.data?.meals ?? []}
          leaves={leave.data?.applications ?? []}
          selectedDate={selectedDate}
          toggle={(entryId, status) => toggle.mutate({ entryId, status })}
          togglePending={toggle.isPending}
          applyPreset={(id) => applyPreset.mutate(id)}
          presetPending={applyPreset.isPending}
          createLeave={(input) => createLeave.mutate(input)}
          leavePending={createLeave.isPending}
        />
      )}
    </motion.div>
  );
}

function ResidentArea({
  entries,
  presets,
  configs,
  leaves,
  selectedDate,
  toggle,
  togglePending,
  applyPreset,
  presetPending,
  createLeave,
  leavePending,
}: {
  entries: MealEntry[];
  presets: MealPreset[];
  configs: MealConfig[];
  leaves: LeaveApplication[];
  selectedDate: string;
  toggle: (entryId: string, status: "ON" | "OFF") => void;
  togglePending: boolean;
  applyPreset: (presetId: string) => void;
  presetPending: boolean;
  createLeave: (input: { startDate: string; endDate: string; reason: string; mealType: "ALL" | "SPECIFIC"; mealIds: string[] }) => void;
  leavePending: boolean;
}) {
  return <>
    {presets.length > 0 && <section className="preset-strip glass-surface"><div><Sparkles size={17} /><span>Quick presets</span></div><div className="preset-actions">{presets.map((preset) => <button key={preset.id} disabled={presetPending} onClick={() => applyPreset(preset.id)} title={preset.description ?? preset.name}>{preset.name}</button>)}</div></section>}
    {entries.length === 0 ? <section className="meal-empty glass-surface"><Utensils size={28} /><strong>No meals are available for this date.</strong><span>This may be before your enrollment date or there may be no active meal configuration.</span></section> : <section className="resident-meal-grid">{entries.map((entry) => {
      const on = statusOn(entry.status);
      return <motion.article whileHover={{ y: -3 }} className={`resident-meal-card glass-surface ${entry.locked ? "is-locked" : ""}`} key={entry.id}>
        <div className="meal-card-top"><div className="meal-emoji">{entry.icon}</div><div className="meal-state-pill">{entry.locked ? <><LockKeyhole size={13} /> Locked</> : on ? "Selected" : "Skipped"}</div></div>
        <div className="meal-card-copy"><h2>{entry.displayName}</h2><span><Clock3 size={14} /> {entry.startTime}–{entry.endTime}</span><small>Cutoff: {formatCutoff(entry.editableUntil)}</small></div>
        <button className={`meal-toggle ${on ? "on" : "off"}`} disabled={entry.locked || togglePending} onClick={() => toggle(entry.id, on ? "OFF" : "ON")} aria-pressed={on}>
          <span className="toggle-track"><i /></span><strong>{on ? "Meal ON" : "Meal OFF"}</strong>
        </button>
        {entry.overridden && <div className="override-note">Administrator override active</div>}
      </motion.article>;
    })}</section>}
    <ResidentLeavePanel configs={configs} applications={leaves} defaultDate={selectedDate} submit={createLeave} pending={leavePending} />
  </>;
}

function ResidentLeavePanel({
  configs,
  applications,
  defaultDate,
  submit,
  pending,
}: {
  configs: MealConfig[];
  applications: LeaveApplication[];
  defaultDate: string;
  submit: (input: { startDate: string; endDate: string; reason: string; mealType: "ALL" | "SPECIFIC"; mealIds: string[] }) => void;
  pending: boolean;
}) {
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [reason, setReason] = useState("");
  const [mealType, setMealType] = useState<"ALL" | "SPECIFIC">("ALL");
  const [mealIds, setMealIds] = useState<string[]>([]);
  const activeConfigs = configs.filter((meal) => meal.status === "ACTIVE");
  const toggleMeal = (id: string) => setMealIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const send = () => {
    if (reason.trim().length < 3) return toast.error("Enter a leave reason");
    if (mealType === "SPECIFIC" && mealIds.length === 0) return toast.error("Select at least one meal");
    submit({ startDate, endDate, reason: reason.trim(), mealType, mealIds: mealType === "ALL" ? [] : mealIds });
  };
  return <section className="leave-panel glass-surface">
    <div className="panel-head"><div><span className="eyebrow">LEAVE</span><h2>Meal leave application</h2></div><ClipboardList size={20} /></div>
    <div className="leave-layout">
      <div className="leave-form">
        <div className="two-field"><label><span>Start date</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label><span>End date</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div>
        <label><span>Reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why will you be away?" rows={3} /></label>
        <div className="leave-scope"><button className={mealType === "ALL" ? "active" : ""} onClick={() => setMealType("ALL")}>All meals</button><button className={mealType === "SPECIFIC" ? "active" : ""} onClick={() => setMealType("SPECIFIC")}>Specific meals</button></div>
        {mealType === "SPECIFIC" && <div className="leave-meal-select">{activeConfigs.map((meal) => <button key={meal.id} className={mealIds.includes(meal.id) ? "selected" : ""} onClick={() => toggleMeal(meal.id)}>{meal.icon} {meal.displayName}</button>)}</div>}
        <button className="primary-button compact" disabled={pending} onClick={send}>{pending ? "Submitting…" : "Submit leave"}<Plus size={16} /></button>
      </div>
      <div className="leave-history"><strong>Recent applications</strong>{applications.length === 0 ? <span className="muted-copy">No leave applications yet.</span> : applications.slice(0, 6).map((application) => <div className="leave-history-row" key={application.id}><div><strong>{dayLabel(application.startDate)} → {dayLabel(application.endDate)}</strong><span>{application.mealType === "ALL" ? "All meals" : `${application.mealIds.length} selected meal(s)`}</span></div><em className={`leave-status ${application.status.toLowerCase()}`}>{application.status}</em></div>)}</div>
    </div>
  </section>;
}

function AdminKitchen({
  data,
  guests,
  configs,
  leaves,
  selectedDate,
  overrideMeal,
  overridePending,
  addGuest,
  guestPending,
  cancelGuest,
  cancelGuestPending,
  decideLeave,
  leavePending,
}: {
  data: KitchenData;
  guests: GuestData;
  configs: MealConfig[];
  leaves: LeaveApplication[];
  selectedDate: string;
  overrideMeal: (input: { userId: string; mealId: string; action: "TURN_ON" | "TURN_OFF"; reason: string }) => void;
  overridePending: boolean;
  addGuest: (input: { mealId: string; guestCount: number; guestName?: string; notes?: string }) => void;
  guestPending: boolean;
  cancelGuest: (id: string) => void;
  cancelGuestPending: boolean;
  decideLeave: (input: { id: string; status: "APPROVED" | "REJECTED"; adminNotes?: string }) => void;
  leavePending: boolean;
}) {
  const guestTotalFor = (mealId: string) => guests.totals.find((item) => item.mealId === mealId)?.guests ?? 0;
  const confirmedWithGuests = data.confirmedMeals + guests.totalGuests;
  const override = (resident: KitchenData["userMealStatus"][number], meal: KitchenData["userMealStatus"][number]["meals"][number]) => {
    if (!meal.locked) return toast.info("Admin override is available after the meal cutoff");
    const desired = statusOn(meal.status) ? "TURN_OFF" : "TURN_ON";
    const reason = window.prompt(`${desired === "TURN_ON" ? "Turn ON" : "Turn OFF"} ${meal.mealName} for ${resident.name}. Enter a reason:`);
    if (!reason || reason.trim().length < 3) return;
    overrideMeal({ userId: resident.userId, mealId: meal.mealId, action: desired, reason: reason.trim() });
  };
  return <>
    <section className="kitchen-kpis">
      <article className="glass-surface"><ChefHat size={19} /><div><span>Confirmed demand</span><strong>{confirmedWithGuests}</strong><small>{data.confirmedMeals} resident · {guests.totalGuests} guest</small></div></article>
      <article className="glass-surface"><Utensils size={19} /><div><span>Active residents</span><strong>{data.activeUsers}</strong><small>eligible residents</small></div></article>
      <article className="glass-surface"><Clock3 size={19} /><div><span>Open choices</span><strong>{data.openChoices}</strong><small>still editable</small></div></article>
    </section>

    <section className="kitchen-count-grid">
      {data.counts.map((meal) => {
        const mealGuests = guestTotalFor(meal.id);
        return <article className="kitchen-count-card glass-surface" key={meal.id}><div className="kitchen-meal-title"><div className="meal-emoji small">{meal.icon}</div><div><strong>{meal.displayName}</strong><span>{meal.startTime}–{meal.endTime}</span></div></div><div className="kitchen-number"><strong>{meal.on + mealGuests}</strong><span>kitchen demand</span></div><div className="count-foot"><span>{meal.on} resident ON</span><span>{mealGuests} guest</span><span>{meal.open} open</span></div></article>;
      })}
    </section>

    <section className="kitchen-residents glass-surface">
      <div className="panel-head"><div><span className="eyebrow">RESIDENT STATUS</span><h2>Selected-day choices</h2><p className="panel-subcopy">Locked chips can be overridden with a mandatory reason. Open choices remain resident-controlled.</p></div><ChefHat size={20} /></div>
      <div className="kitchen-resident-head"><span>Resident</span><span>Room</span><span>Meals</span></div>
      <div className="kitchen-resident-list">{data.userMealStatus.map((resident) => <div className="kitchen-resident-row" key={resident.userId}><strong>{resident.name}</strong><span>{resident.room ?? "—"}</span><div className="resident-meal-chips">{resident.meals.map((meal) => <button disabled={overridePending} onClick={() => override(resident, meal)} key={meal.mealId} className={`${statusOn(meal.status) ? "meal-chip-on" : "meal-chip-off"} ${meal.confirmed ? "confirmed" : "open"} ${meal.locked ? "can-override" : ""}`}>{meal.mealName}: {statusOn(meal.status) ? "ON" : "OFF"}{meal.confirmed ? "" : " · open"}</button>)}</div></div>)}</div>
    </section>

    <GuestMealPanel configs={configs} guests={guests} selectedDate={selectedDate} add={addGuest} pending={guestPending} cancel={cancelGuest} cancelPending={cancelGuestPending} />
    <AdminLeavePanel applications={leaves} decide={decideLeave} pending={leavePending} />

    <section className="meal-config-panel glass-surface"><div className="panel-head"><div><span className="eyebrow">MEAL CONFIGURATION</span><h2>Service schedule</h2></div><Utensils size={20} /></div><div className="meal-config-list">{configs.filter((meal) => meal.status === "ACTIVE").map((meal) => <div className="meal-config-row" key={meal.id}><div className="meal-emoji tiny">{meal.icon}</div><div><strong>{meal.displayName}</strong><span>{meal.startTime}–{meal.endTime}</span></div><em>{meal.cutoffStrategy === "PREVIOUS_DAY" ? `Previous day ${meal.cutoffTime}` : meal.cutoffStrategy === "SAME_DAY" ? `Same day ${meal.cutoffTime}` : "Custom cutoff"}</em></div>)}</div></section>
  </>;
}

function GuestMealPanel({ configs, guests, selectedDate, add, pending, cancel, cancelPending }: {
  configs: MealConfig[];
  guests: GuestData;
  selectedDate: string;
  add: (input: { mealId: string; guestCount: number; guestName?: string; notes?: string }) => void;
  pending: boolean;
  cancel: (id: string) => void;
  cancelPending: boolean;
}) {
  const active = configs.filter((meal) => meal.status === "ACTIVE");
  const [mealId, setMealId] = useState(active[0]?.id ?? "");
  const [guestCount, setGuestCount] = useState(1);
  const [guestName, setGuestName] = useState("");
  const [notes, setNotes] = useState("");
  return <section className="guest-panel glass-surface">
    <div className="panel-head"><div><span className="eyebrow">GUEST MEALS</span><h2>{dayLabel(selectedDate)} guest demand</h2></div><UserPlus size={20} /></div>
    <div className="guest-layout">
      <div className="guest-form"><label><span>Meal</span><select value={mealId} onChange={(event) => setMealId(event.target.value)}>{active.map((meal) => <option key={meal.id} value={meal.id}>{meal.icon} {meal.displayName}</option>)}</select></label><label><span>Guests</span><input type="number" min={1} max={100} value={guestCount} onChange={(event) => setGuestCount(Number(event.target.value))} /></label><label><span>Name / group</span><input value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Optional" /></label><label className="guest-notes"><span>Notes</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" /></label><button className="primary-button compact" disabled={pending || !mealId} onClick={() => add({ mealId, guestCount, guestName: guestName.trim() || undefined, notes: notes.trim() || undefined })}>{pending ? "Adding…" : "Add guest meal"}<Plus size={16} /></button></div>
      <div className="guest-list">{guests.entries.length === 0 ? <span className="muted-copy">No guest meals for this date.</span> : guests.entries.map((entry) => <div className="guest-row" key={entry.id}><div className="guest-badge">{entry.mealIcon}</div><div><strong>{entry.guestName || entry.mealName}</strong><span>{entry.mealName} · {entry.guestCount} guest{entry.guestCount === 1 ? "" : "s"}{entry.notes ? ` · ${entry.notes}` : ""}</span></div><button disabled={cancelPending} onClick={() => cancel(entry.id)}><XCircle size={16} /> Cancel</button></div>)}</div>
    </div>
  </section>;
}

function AdminLeavePanel({ applications, decide, pending }: { applications: LeaveApplication[]; decide: (input: { id: string; status: "APPROVED" | "REJECTED"; adminNotes?: string }) => void; pending: boolean }) {
  const pendingApps = applications.filter((application) => application.status === "PENDING");
  const recent = applications.filter((application) => application.status !== "PENDING").slice(0, 6);
  const decision = (application: LeaveApplication, status: "APPROVED" | "REJECTED") => {
    const note = window.prompt(`${status === "APPROVED" ? "Approve" : "Reject"} leave for ${application.userName}. Admin note (optional):`);
    if (note === null) return;
    decide({ id: application.id, status, adminNotes: note.trim() || undefined });
  };
  return <section className="leave-panel glass-surface">
    <div className="panel-head"><div><span className="eyebrow">LEAVE REVIEW</span><h2>Pending meal leave</h2><p className="panel-subcopy">Approval atomically locks the selected leave-period meal entries OFF.</p></div><ClipboardList size={20} /></div>
    <div className="admin-leave-list">{pendingApps.length === 0 ? <div className="leave-empty"><CheckCircle2 size={20} /><span>No leave applications need review.</span></div> : pendingApps.map((application) => <article className="admin-leave-row" key={application.id}><div><strong>{application.userName}</strong><span>{application.room ?? "No room"} · {dayLabel(application.startDate)} → {dayLabel(application.endDate)}</span><small>{application.reason} · {application.mealType === "ALL" ? "All meals" : `${application.mealIds.length} selected meal(s)`}</small></div><div className="leave-actions"><button className="approve" disabled={pending} onClick={() => decision(application, "APPROVED")}><CheckCircle2 size={15} /> Approve</button><button className="reject" disabled={pending} onClick={() => decision(application, "REJECTED")}><XCircle size={15} /> Reject</button></div></article>)}</div>
    {recent.length > 0 && <div className="leave-recent"><strong>Recent decisions</strong>{recent.map((application) => <div key={application.id}><span>{application.userName} · {dayLabel(application.startDate)}–{dayLabel(application.endDate)}</span><em className={`leave-status ${application.status.toLowerCase()}`}>{application.status}</em></div>)}</div>}
  </section>;
}
