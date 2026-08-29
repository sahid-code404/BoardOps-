import { describe, expect, it } from "vitest";
import { dateWithinRange, rangesOverlap, validateCalendarRange } from "../../services/api/src/domain/calendar-rules";

describe("calendar rules", () => {
  it("accepts inclusive date ranges", () => {
    expect(validateCalendarRange("2026-09-01", "2026-09-03")).toEqual({
      startDate: "2026-09-01",
      endDate: "2026-09-03",
    });
    expect(dateWithinRange("2026-09-03", { startDate: "2026-09-01", endDate: "2026-09-03" })).toBe(true);
  });

  it("rejects inverted or invalid calendar dates", () => {
    expect(() => validateCalendarRange("2026-09-03", "2026-09-01")).toThrow("End date cannot be before start date");
    expect(() => validateCalendarRange("2026-02-30", "2026-03-01")).toThrow("Invalid calendar date");
  });

  it("detects inclusive overlap without merging adjacent ranges", () => {
    expect(rangesOverlap(
      { startDate: "2026-09-01", endDate: "2026-09-02" },
      { startDate: "2026-09-02", endDate: "2026-09-03" },
    )).toBe(true);
    expect(rangesOverlap(
      { startDate: "2026-09-01", endDate: "2026-09-01" },
      { startDate: "2026-09-02", endDate: "2026-09-02" },
    )).toBe(false);
  });

  it("enforces a maximum range", () => {
    expect(() => validateCalendarRange("2026-01-01", "2026-01-03", 2)).toThrow("Calendar event cannot exceed 2 days");
  });
});
