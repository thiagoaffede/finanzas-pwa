import { describe, expect, it } from "vitest";
import { adjustmentDates, nextRentAdjustment, rentAdjustments, rentAt, rentByMonth, type RentContract } from "./rent-adjustment";

const fixed: RentContract = { startDate: "2026-01-01", baseRentCents: 50_000_000, adjustmentIntervalMonths: 3, indexType: "FIXED", fixedRate: 0.1, durationMonths: 24 };

describe("alquiler", () => {
  it("genera fechas de ajuste", () => {
    expect(adjustmentDates(fixed, "2026-12-31")).toEqual(["2026-04-01", "2026-07-01", "2026-10-01"]);
    expect(adjustmentDates({ ...fixed, durationMonths: 6 }, "2027-12-31")).toEqual(["2026-04-01"]);
  });

  it("acuerdo fijo compone ajustes", () => {
    const adj = rentAdjustments(fixed, {}, "2026-12-31");
    expect(adj.map((a) => a.toCents)).toEqual([55_000_000, 60_500_000, 66_550_000]);
    expect(rentAt(fixed, {}, "2026-08-15")).toBe(60_500_000);
    expect(rentAt(fixed, {}, "2026-02-01")).toBe(50_000_000);
  });

  it("IPC compone los meses con rezago", () => {
    const ipc: RentContract = { ...fixed, indexType: "IPC", fixedRate: undefined };
    const indices = { ipc: [ { month: "2025-12", rate: 0.02 }, { month: "2026-01", rate: 0.03 }, { month: "2026-02", rate: 0.04 } ] };
    const [first] = rentAdjustments(ipc, indices, "2026-04-30");
    expect(first.coefficient).toBeCloseTo(1.02 * 1.03 * 1.04, 10);
    expect(first.toCents).toBe(54_631_200);
    expect(first.projected).toBe(false);
    expect(first.detail).toContain("2025-12 a 2026-02");
  });

  it("IPC faltante se proyecta y se marca", () => {
    const ipc: RentContract = { ...fixed, indexType: "IPC" };
    const [first] = rentAdjustments(ipc, { ipc: [{ month: "2025-12", rate: 0.02 }] }, "2026-04-30", { projectedMonthlyInflation: 0.05 });
    expect(first.projected).toBe(true);
    expect(first.coefficient).toBeCloseTo(1.02 * 1.05 * 1.05, 10);
  });

  it("ICL usa el cociente entre fechas y proyecta si falta el último dato", () => {
    const icl: RentContract = { ...fixed, indexType: "ICL" };
    const indices = { icl: [ { date: "2026-01-01", value: 20 }, { date: "2026-04-01", value: 22 } ] };
    const adj = rentAdjustments(icl, indices, "2026-07-31", { projectedMonthlyInflation: 0.03 });
    expect(adj[0].coefficient).toBeCloseTo(1.1, 10);
    expect(adj[0].toCents).toBe(55_000_000);
    expect(adj[1].projected).toBe(true);
    expect(adj[1].coefficient).toBeCloseTo(Math.pow(1.03, 3), 10);
  });

  it("alquiler por mes para el cashflow y próximo ajuste", () => {
    const m = rentByMonth(fixed, {}, ["2025-12", "2026-03", "2026-04", "2026-05"]);
    expect(m.has("2025-12")).toBe(false);
    expect(m.get("2026-03")).toBe(50_000_000);
    expect(m.get("2026-04")).toBe(55_000_000);
    const next = nextRentAdjustment(fixed, {}, "2026-05-10");
    expect(next).toMatchObject({ date: "2026-07-01", currentCents: 55_000_000, newCents: 60_500_000, increaseCents: 5_500_000 });
  });
});
