import { describe, expect, it } from "vitest";
import {
  computeEditableUntil,
  isMealEntryLocked,
  isOverridden,
  zonedDateTimeToUtc,
} from "../../services/api/src/domain/meal-engine";

describe("meal cutoff engine", () => {
  it("converts institution-local time to UTC without shifting the service day", () => {
    expect(zonedDateTimeToUtc("2026-08-30", "08:00", "Asia/Kolkata").toISOString()).toBe("2026-08-30T02:30:00.000Z");
  });

  it("supports previous-day cutoffs", () => {
    const cutoff = computeEditableUntil({ cutoffStrategy: "PREVIOUS_DAY", cutoffTime: "22:00", cutoffOffsetMinutes: 0, startTime: "07:30" }, "2026-08-30", "Asia/Kolkata");
    expect(cutoff.toISOString()).toBe("2026-08-29T16:30:00.000Z");
  });

  it("supports custom offsets from the meal start", () => {
    const cutoff = computeEditableUntil({ cutoffStrategy: "CUSTOM_OFFSET", cutoffTime: "00:00", cutoffOffsetMinutes: 90, startTime: "19:30" }, "2026-08-30", "Asia/Kolkata");
    expect(cutoff.toISOString()).toBe("2026-08-30T12:30:00.000Z");
  });

  it("treats LOCKED as an effective ON state and detects admin-style overrides", () => {
    expect(isOverridden({ status: "LOCKED", originalState: "ON" })).toBe(false);
    expect(isOverridden({ status: "LOCKED", originalState: "OFF" })).toBe(true);
  });

  it("locks at editableUntil even before the persisted lock flag is refreshed", () => {
    expect(isMealEntryLocked({ locked: false, status: "ON", editableUntil: "2026-08-29T10:00:00.000Z" }, new Date("2026-08-29T10:00:00.000Z"))).toBe(true);
  });
});
