import { describe, expect, it } from "vitest";
import { buildMonthlyReport } from "./report";

describe("reporte mensual", () => {
  const txs = [
    { date: "2026-09-05", amountCents: 1_000_000_00, isIncome: true, category: "Sueldo" },
    { date: "2026-10-05", amountCents: 1_000_000_00, isIncome: true, category: "Sueldo" },
    { date: "2026-10-10", amountCents: 200_000_00, isIncome: false, category: "Comida" },
    { date: "2026-11-05", amountCents: 1_100_000_00, isIncome: true, category: "Sueldo" },
    { date: "2026-11-10", amountCents: 220_000_00, isIncome: false, category: "Comida" },
    { date: "2026-11-12", amountCents: 100_000_00, isIncome: false, category: "Salidas", owedCents: 20_000_00 },
  ];
  const ipc = new Map([["2026-10", 0.02], ["2026-11", 0.025]]);
  const r = buildMonthlyReport("2026-11", txs, ipc, 0.03, 3);

  it("totales, ahorro y variaciones nominales y reales", () => {
    expect(r.current).toMatchObject({ incomeCents: 1_100_000_00, expenseCents: 300_000_00, savingCents: 800_000_00, ipc: 0.025, ipcEstimated: false });
    expect(r.savingsRate).toBeCloseTo(800 / 1100);
    expect(r.incomeChange).toBeCloseTo(0.1);
    expect(r.incomeRealChange).toBeCloseTo(1.1 / 1.025 - 1);
    expect(r.months[0].ipcEstimated).toBe(true); // septiembre sin IPC cargado
    expect(r.anyEstimated).toBe(true);
  });

  it("lleva cada mes a pesos de hoy", () => {
    expect(r.months[1].realIncomeCents).toBe(Math.round(1_000_000_00 * 1.025));
    expect(r.months[0].realIncomeCents).toBe(Math.round(1_000_000_00 * 1.025 * 1.02));
    expect(r.purchasingPower?.fromMonth).toBe("2026-09");
    expect(r.purchasingPower?.change).toBeCloseTo(1.1 / (1.025 * 1.02) - 1);
    expect(r.inflation12m).toBeCloseTo(1.02 * 1.025 - 1);
  });

  it("gastos por categoría contra el mes anterior", () => {
    expect(r.categories[0]).toMatchObject({ category: "Comida", cents: 220_000_00, prevCents: 200_000_00 });
    expect(r.categories[0].change).toBeCloseTo(0.1);
    expect(r.categories[1]).toMatchObject({ category: "Salidas", cents: 80_000_00, prevCents: 0, change: null });
  });
});
