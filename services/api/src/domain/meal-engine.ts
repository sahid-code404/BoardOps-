export type MealState = "ON" | "OFF";
export type MealEntryStatus = MealState | "LOCKED";
export type CutoffStrategy = "PREVIOUS_DAY" | "SAME_DAY" | "CUSTOM_OFFSET";

export type MealSchedule = {
  cutoffStrategy: CutoffStrategy;
  cutoffTime: string;
  cutoffOffsetMinutes: number;
  startTime: string;
};

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK = /^(\d{2}):(\d{2})$/;

export function parseDateKey(value: string): { year: number; month: number; day: number } {
  const match = DATE_KEY.exec(value);
  if (!match) throw new Error("Date must use YYYY-MM-DD format");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error("Invalid calendar date");
  }
  return { year, month, day };
}

export function addDays(dateKey: string, days: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parseClock(value: string): { hour: number; minute: number } {
  const match = CLOCK.exec(value);
  if (!match) throw new Error("Time must use HH:mm format");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("Invalid clock time");
  return { hour, minute };
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

export function zonedDateTimeToUtc(dateKey: string, clock: string, timeZone: string): Date {
  const { year, month, day } = parseDateKey(dateKey);
  const { hour, minute } = parseClock(clock);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = targetAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = localParts(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const delta = targetAsUtc - actualAsUtc;
    guess += delta;
    if (Math.abs(delta) < 1_000) break;
  }
  return new Date(guess);
}

export function todayInZone(timeZone: string, now = new Date()): string {
  const parts = localParts(now, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function computeEditableUntil(schedule: MealSchedule, serviceDate: string, timeZone: string): Date {
  if (schedule.cutoffStrategy === "CUSTOM_OFFSET") {
    const serviceStart = zonedDateTimeToUtc(serviceDate, schedule.startTime, timeZone);
    return new Date(serviceStart.getTime() - schedule.cutoffOffsetMinutes * 60_000);
  }
  const cutoffDate = schedule.cutoffStrategy === "PREVIOUS_DAY" ? addDays(serviceDate, -1) : serviceDate;
  return zonedDateTimeToUtc(cutoffDate, schedule.cutoffTime, timeZone);
}

export function effectiveMealStatus(status: MealEntryStatus): MealState {
  return status === "LOCKED" ? "ON" : status;
}

export function isMealEntryLocked(
  entry: { locked: boolean; status: MealEntryStatus; editableUntil: string | Date },
  now = new Date(),
): boolean {
  return entry.locked || entry.status === "LOCKED" || new Date(entry.editableUntil).getTime() <= now.getTime();
}

export function isOverridden(entry: { status: MealEntryStatus; originalState: MealState }): boolean {
  return effectiveMealStatus(entry.status) !== entry.originalState;
}
