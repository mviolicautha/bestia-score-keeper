import { describe, expect, it } from "vitest";
import { isChristmasSeason } from "./season";

describe("periodo delle feste", () => {
  it("è la settimana dal 21 al 27 dicembre compresi", () => {
    expect(isChristmasSeason(new Date(2026, 11, 1))).toBe(false);
    expect(isChristmasSeason(new Date(2026, 11, 20, 23, 59))).toBe(false);
    expect(isChristmasSeason(new Date(2026, 11, 21))).toBe(true);
    expect(isChristmasSeason(new Date(2026, 11, 25))).toBe(true);
    expect(isChristmasSeason(new Date(2026, 11, 27, 23, 59))).toBe(true);
    expect(isChristmasSeason(new Date(2026, 11, 28))).toBe(false);
    expect(isChristmasSeason(new Date(2027, 0, 1))).toBe(false);
    expect(isChristmasSeason(new Date(2027, 11, 21, 21))).toBe(true);
  });
});
