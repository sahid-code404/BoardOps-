declare const minorUnitBrand: unique symbol;

export type MinorUnits = number & { readonly [minorUnitBrand]: "MinorUnits" };

export function minorUnits(value: number): MinorUnits {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Money must be represented as a safe integer in minor units");
  }
  return value as MinorUnits;
}

export function addMinorUnits(a: MinorUnits, b: MinorUnits): MinorUnits {
  return minorUnits(a + b);
}

export function subtractMinorUnits(a: MinorUnits, b: MinorUnits): MinorUnits {
  return minorUnits(a - b);
}
