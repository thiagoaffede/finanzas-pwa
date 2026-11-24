import { describe, expect, it } from "vitest";
import { annualFromMonthly, monthlyFromAnnual, parseAmountToCents, splitCents, toCents } from "./money";

describe("money", () => {
  it("convierte a centavos", () => {
    expect(toCents(1234.56)).toBe(123456);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("parsea montos en formato argentino y anglosajón", () => {
    expect(parseAmountToCents("1.234,56")).toBe(123456);
    expect(parseAmountToCents("1234.56")).toBe(123456);
    expect(parseAmountToCents("1,234.56")).toBe(123456);
    expect(parseAmountToCents("1.234.567")).toBe(123456700);
    expect(parseAmountToCents("$ 10")).toBe(1000);
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents("")).toBeNull();
  });

  it("reparte cuotas sin perder centavos", () => {
    expect(splitCents(1000, 3)).toEqual([334, 333, 333]);
    expect(splitCents(-1000, 3)).toEqual([-334, -333, -333]);
    expect(splitCents(999, 3)).toEqual([333, 333, 333]);
    expect(() => splitCents(100, 0)).toThrow();
  });

  it("convierte tasas mensual/anual", () => {
    expect(annualFromMonthly(0.01)).toBeCloseTo(0.126825, 5);
    expect(monthlyFromAnnual(annualFromMonthly(0.03))).toBeCloseTo(0.03, 10);
  });
});
