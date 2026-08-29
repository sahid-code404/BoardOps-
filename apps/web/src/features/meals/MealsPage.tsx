import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarDays, ChefHat, Clock3, LockKeyhole, RefreshCw, ShieldCheck, Utensils } from "lucide-react";
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

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
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

  const kitchen = useQuery({
    queryKey: ["kitchen", selectedDate],
    queryFn: () => apiRequest<KitchenData>(`/kitchen?date=${selectedDate}`),
    enabled: user.role === "ADMIN",
  });

  const toggle = useMutation({
    mutationFn: ({ entryId, status }: { entryId: string; status: "ON" | "OFF" }) => apiRequest<{ changed: boolean; status?: string }>("/meals/toggle", {
      method: "PATCH",
      body: JSON.stringify({ entryId, status }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal-entries", selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["kitchen", selectedDate] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const loading = configs.isLoading || (user.role === "USER" ? residentEntries.isLoading : kitchen.isLoading);
  const error = configs.error || (user.role === "USER" ? residentEntries.error : kitchen.error);

  return (
    <motion.div className="page-stack meals-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <section className="page-heading meal-heading">
        <div><span className="eyebrow">MEALS</span><h1>{user.role === "ADMIN" ? "Kitchen & meal operations" : "My meals"}</h1><p>{user.role === "ADMIN" ? "Confirmed kitchen demand follows locked or explicit choices; open choices stay visible until cutoff." : "Choose your meals before each cutoff. Locked choices cannot be changed by residents."}</p></div>
        <div className="meal-date-current"><CalendarDays size={17} /><div><span>Selected day</span><strong>{dayLabel(selectedDate)}</strong></div></div>
      </section>

      <section className="meal-date-strip glass-surface">
        {dateOptions.map((date) => <button key={date} className={selectedDate === date ? "selected" : ""} onClick={() => setSelectedDate(date)}><span>{date === today ? "Today" : new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(dateFromKey(date))}</span><strong>{dateFromKey(date).getDate()}</strong></button>)}
      </section>

      {loading ? <div className="meal-loading-grid">{[0, 1, 2].map((item) => <div key={item} className="skeleton meal-skeleton" />)}</div> : error ? <PageError message={(error as Error).message} retry={() => { configs.refetch(); user.role === "ADMIN" ? kitchen.refetch() : residentEntries.refetch(); }} /> : user.role === "ADMIN" ? (
        <AdminKitchen data={kitchen.data!} configs={configs.data?.meals ?? []} />
      ) : (
        <ResidentMeals entries={residentEntries.data?.meals ?? []} toggle={(entryId, status) => toggle.mutate({ entryId, status })} pending={toggle.isPending} />
      )}
    </motion.div>
  );
}

function ResidentMeals({ entries, toggle, pending }: { entries: MealEntry[]; toggle: (entryId: string, status: "ON" | "OFF") => void; pending: boolean }) {
  if (entries.length === 0) return <section className="meal-empty glass-surface"><Utensils size={28} /><strong>No meals are available for this date.</strong><span>This may be before your enrollment date or there may be no active meal configuration.</span></section>;
  return <section className="resident-meal-grid">{entries.map((entry) => {
    const on = statusOn(entry.status);
    return <motion.article whileHover={{ y: -3 }} className={`resident-meal-card glass-surface ${entry.locked ? "is-locked" : ""}`} key={entry.id}>
      <div className="meal-card-top"><div className="meal-emoji">{entry.icon}</div><div className="meal-state-pill">{entry.locked ? <><LockKeyhole size={13} /> Locked</> : on ? "Selected" : "Skipped"}</div></div>
      <div className="meal-card-copy"><h2>{entry.displayName}</h2><span><Clock3 size={14} /> {entry.startTime}–{entry.endTime}</span><small>Cutoff: {formatCutoff(entry.editableUntil)}</small></div>
      <button className={`meal-toggle ${on ? "on" : "off"}`} disabled={entry.locked || pending} onClick={() => toggle(entry.id, on ? "OFF" : "ON")} aria-pressed={on}>
        <span className="toggle-track"><i /></span><strong>{on ? "Meal ON" : "Meal OFF"}</strong>
      </button>
      {entry.overridden && <div className="override-note">Administrator override active</div>}
    </motion.article>;
  })}</section>;
}

function AdminKitchen({ data, configs }: { data: KitchenData; configs: MealConfig[] }) {
  return <>
    <section className="kitchen-kpis">
      <article className="glass-surface"><ChefHat size={19} /><div><span>Confirmed meals</span><strong>{data.confirmedMeals}</strong><small>locked demand</small></div></article>
      <article className="glass-surface"><Utensils size={19} /><div><span>Active residents</span><strong>{data.activeUsers}</strong><small>eligible residents</small></div></article>
      <article className="glass-surface"><Clock3 size={19} /><div><span>Open choices</span><strong>{data.openChoices}</strong><small>still editable</small></div></article>
    </section>

    <section className="kitchen-count-grid">
      {data.counts.map((meal) => <article className="kitchen-count-card glass-surface" key={meal.id}><div className="kitchen-meal-title"><div className="meal-emoji small">{meal.icon}</div><div><strong>{meal.displayName}</strong><span>{meal.startTime}–{meal.endTime}</span></div></div><div className="kitchen-number"><strong>{meal.on}</strong><span>confirmed ON</span></div><div className="count-foot"><span>{meal.off} confirmed off</span><span>{meal.open} open</span></div></article>)}
    </section>

    <section className="kitchen-residents glass-surface">
      <div className="panel-head"><div><span className="eyebrow">RESIDENT STATUS</span><h2>Selected-day choices</h2></div><ChefHat size={20} /></div>
      <div className="kitchen-resident-head"><span>Resident</span><span>Room</span><span>Meals</span></div>
      <div className="kitchen-resident-list">{data.userMealStatus.map((resident) => <div className="kitchen-resident-row" key={resident.userId}><strong>{resident.name}</strong><span>{resident.room ?? "—"}</span><div className="resident-meal-chips">{resident.meals.map((meal) => <span key={meal.mealId} className={`${statusOn(meal.status) ? "meal-chip-on" : "meal-chip-off"} ${meal.confirmed ? "confirmed" : "open"}`}>{meal.mealName}: {statusOn(meal.status) ? "ON" : "OFF"}{meal.confirmed ? "" : " · open"}</span>)}</div></div>)}</div>
    </section>

    <section className="meal-config-panel glass-surface"><div className="panel-head"><div><span className="eyebrow">MEAL CONFIGURATION</span><h2>Service schedule</h2></div><Utensils size={20} /></div><div className="meal-config-list">{configs.filter((meal) => meal.status === "ACTIVE").map((meal) => <div className="meal-config-row" key={meal.id}><div className="meal-emoji tiny">{meal.icon}</div><div><strong>{meal.displayName}</strong><span>{meal.startTime}–{meal.endTime}</span></div><em>{meal.cutoffStrategy === "PREVIOUS_DAY" ? `Previous day ${meal.cutoffTime}` : meal.cutoffStrategy === "SAME_DAY" ? `Same day ${meal.cutoffTime}` : "Custom cutoff"}</em></div>)}</div></section>
  </>;
}
