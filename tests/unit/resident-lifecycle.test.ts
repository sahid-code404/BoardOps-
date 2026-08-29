import { describe, expect, it } from "vitest";
import {
  allowedResidentActions,
  nextResidentStatus,
  residentActionRequiresReason,
} from "../../services/api/src/domain/resident-lifecycle";

describe("resident lifecycle", () => {
  it("allows only explicit state transitions", () => {
    expect(nextResidentStatus("PENDING", "APPROVE")).toBe("ACTIVE");
    expect(nextResidentStatus("ACTIVE", "SUSPEND")).toBe("SUSPENDED");
    expect(nextResidentStatus("SUSPENDED", "ACTIVATE")).toBe("ACTIVE");
    expect(nextResidentStatus("ARCHIVED", "RESTORE")).toBe("ACTIVE");
  });

  it("rejects invalid state transitions", () => {
    expect(() => nextResidentStatus("ACTIVE", "APPROVE")).toThrow(/not valid/);
    expect(() => nextResidentStatus("PENDING", "SUSPEND")).toThrow(/not valid/);
    expect(() => nextResidentStatus("ARCHIVED", "SUSPEND")).toThrow(/not valid/);
  });

  it("requires reasons for destructive or review-return actions", () => {
    expect(residentActionRequiresReason("REJECT")).toBe(true);
    expect(residentActionRequiresReason("REQUEST_CHANGES")).toBe(true);
    expect(residentActionRequiresReason("SUSPEND")).toBe(true);
    expect(residentActionRequiresReason("APPROVE")).toBe(false);
  });

  it("exposes the action set for UI/API parity", () => {
    expect(allowedResidentActions("PENDING")).toEqual(["APPROVE", "REQUEST_CHANGES", "REJECT"]);
    expect(allowedResidentActions("SUSPENDED")).toEqual(["ACTIVATE", "ARCHIVE"]);
  });
});
