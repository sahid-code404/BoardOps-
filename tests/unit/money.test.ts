import { describe, expect, it } from "vitest";
import { addMinorUnits, minorUnits } from "../../packages/accounting/src/money";

describe("minor-unit money invariant", () => {
  it("accepts integer paise values", () => {
    expect(addMinorUnits(minorUnits(125050), minorUnits(950))).toBe(126000);
  });

  it("rejects fractional money storage", () => {
    expect(() => minorUnits(10.25)).toThrow(RangeError);
  });
});
