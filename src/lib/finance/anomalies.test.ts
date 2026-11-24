import { describe, expect, it } from "vitest";
import { detectBillAnomaly } from "./anomalies";
import { priceVsInflation } from "./price-history";

const history = [
  { period: "2026-05", amountCents: 9_800 },
  { period: "2026-06", amountCents: 10_200 },
  { period: "2026-07", amountCents: 10_000 },
  { period: "2026-08", amountCents: 9_900 },
  { period: "2026-09", amountCents: 10_100 },
  { period: "2026-10", amountCents: 10_000 },
];

describe("anomalías de boletas", () => {
  it("avisa cuando la boleta viene muy por encima del promedio", () => {
    const r = detectBillAnomaly(history, { period: "2026-11", amountCents: 15_000 });
    expect(r.isAnomaly).toBe(true);
    expect(r.baselineCents).toBe(10_000);
    expect(r.deviationPct).toBeCloseTo(0.5, 5);
  });

  it("no avisa si la suba se explica por inflación", () => {
    const r = detectBillAnomaly(history, { period: "2026-11", amountCents: 12_000 }, { monthlyInflation: 0.04 });
    expect(r.isAnomaly).toBe(false);
  });

  it("no avisa si es estacional (similar al mismo mes del año pasado)", () => {
    const r = detectBillAnomaly([...history, { period: "2025-11", amountCents: 14_500 }], { period: "2026-11", amountCents: 15_000 });
    expect(r.isAnomaly).toBe(false);
    expect(r.reason).toMatch(/estacional/);
  });

  it("no opina con poco historial", () => {
    const r = detectBillAnomaly(history.slice(-2), { period: "2026-11", amountCents: 50_000 });
    expect(r.isAnomaly).toBe(false);
    expect(r.reason).toMatch(/insuficiente/);
  });
});

describe("historial de precios", () => {
  it("compara contra la inflación", () => {
    const r = priceVsInflation(
      [{ month: "2026-01", priceCents: 100 }, { month: "2026-03", priceCents: 150 }],
      new Map([["2026-02", 0.1], ["2026-03", 0.1]]),
    )!;
    expect(r.priceChange).toBeCloseTo(0.5, 10);
    expect(r.inflation).toBeCloseTo(0.21, 10);
    expect(r.realChange).toBeCloseTo(1.5 / 1.21 - 1, 10);
  });
});
