import { addDays, parseDateKey } from "./meal-engine";

export type CalendarEventType =
  | "HOLIDAY"
  | "FESTIVAL"
  | "SPECIAL_MEAL"
  | "BILLING_DAY"
  | "REFUND_DAY"
  | "MAINTENANCE";

export type CalendarRange = {
  startDate: string;
  endDate: string;
};

export function validateCalendarRange(startDate: string, endDate: string, maxDays = 3660): CalendarRange {
  parseDateKey(startDate);
  parseDateKey(endDate);
  if (endDate < startDate) throw new Error("End date cannot be before start date");

  let cursor = startDate;
  let days = 1;
  while (cursor < endDate) {
    cursor = addDays(cursor, 1);
    days += 1;
    if (days > maxDays) throw new Error(`Calendar event cannot exceed ${maxDays} days`);
  }
  return { startDate, endDate };
}

export function rangesOverlap(a: CalendarRange, b: CalendarRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function dateWithinRange(date: string, range: CalendarRange): boolean {
  parseDateKey(date);
  return date >= range.startDate && date <= range.endDate;
}
