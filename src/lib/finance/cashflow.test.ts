import { describe, expect, it } from "vitest";
import { installmentPlan, projectCashflow, recurring, type CashflowInput } from "./cashflow";
import { simulate } from "./simulator";

const base: CashflowInput = {
  startMonth: "2026-12",
  months: 3,
  openingBalanceCents: 0,
  recurring: [
    { kind: "income", direction: "in", label: "Sueldo", amountCents: 1000, fromMonth: "2026-01" },
    { kind: "rent", direction: "out", label: "Alquiler", amountCents: 600, fromMonth: "2026-01", indexed: true },
  ],
  installmentPlans: [{ label: "Heladera", firstMonth: "2027-01", count: 3, installmentCents: 200 }],
  oneOff: [],
};

describe("cashflow", () => {
  it("expande recurrentes con crecimiento", () => {
    const e = recurring({ kind: "bill", direction: "out", label: "Luz", amountCents: 1000, fromMonth: "2026-01", monthlyGrowth: 0.1 }, ["2026-01", "2026-02", "2026-03"]);
    expect(e.map((x) => x.amountCents)).toEqual([1000, 1100, 1210]);
  });

  it("genera cuotas futuras", () => {
    const plan = installmentPlan({ label: "TV", firstMonth: "2026-12", count: 3, totalCents: 1000 });
    expect(plan.map((p) => [p.month, p.amountCents])).toEqual([["2026-12", 334], ["2027-01", 333], ["2027-02", 333]]);
    expect(plan[0].label).toBe("TV (1/3)");
  });

  it("proyecta saldos", () => {
    const p = projectCashflow(base);
    expect(p.months.map((m) => m.closingCents)).toEqual([400, 600, 800]);
    expect(p.bottlenecks).toEqual([]);
  });

  it("detecta cuellos de botella", () => {
    const p = projectCashflow({ ...base, oneOff: [{ month: "2027-02", kind: "other", direction: "out", label: "Seguro anual", amountCents: 1000 }] });
    expect(p.bottlenecks).toEqual(["2027-02"]);
    expect(p.minClosingCents).toBe(-200);
    expect(p.months[2].reasons.length).toBeGreaterThan(0);
  });
});

describe("simulador", () => {
  it("simula una compra en cuotas sin tocar el escenario base", () => {
    const r = simulate(base, [{ type: "addPurchase", label: "Bici", firstMonth: "2026-12", count: 3, totalCents: 900 }]);
    expect(r.deltas.map((d) => d.closingDeltaCents)).toEqual([-300, -600, -900]);
    expect(base.installmentPlans).toHaveLength(1);
  });

  it("la inflación del escenario solo afecta lo indexado", () => {
    const r = simulate(base, [{ type: "setInflation", monthlyRate: 0.1 }]);
    // Alquiler 600 crece desde enero 2026: en dic-26 ya lleva 11 meses.
    const rentDec = Math.round(600 * Math.pow(1.1, 11));
    expect(r.scenario.months[0].byKind.rent).toBe(rentDec);
    expect(r.scenario.months[0].incomeCents).toBe(1000);
    expect(r.newBottlenecks.length).toBeGreaterThan(0);
  });

  it("ajusta aportes a objetivos e ingreso", () => {
    const r = simulate(base, [
      { type: "setGoalContribution", label: "Vacaciones", amountCents: 100 },
      { type: "scaleIncome", factor: 1.1 },
    ]);
    expect(r.deltas[0].netDeltaCents).toBe(0); // +100 ingreso −100 objetivo
  });
});
