import { describe, expect, it } from "vitest";
import { buildMoneyPlan, normalizeSplit, type PlanInput } from "./money-plan";

const base: PlanInput = {
  netIncomeCents: 126_600_000, // $1.266.000
  rentCents: 40_000_000,
  servicesCents: 9_000_000,
  cuotasCents: 5_000_000,
  spentByCategory: {},
  avgVariableCents: 0,
  dayOfMonth: 15,
  daysInMonth: 30,
  operatingBalanceCents: 0,
  emergencySavedCents: 0,
  hasEmergencyGoal: false,
  monthlyInflation: 0.022,
  hasBudgets: true,
};

describe("plan de la plata", () => {
  it("reparte 55/25/20 y descuenta los fijos de los necesarios", () => {
    const p = buildMoneyPlan(base);
    expect(p.blocks.map((b) => b.plannedCents)).toEqual([69_630_000, 31_650_000, 25_320_000]);
    expect(p.fixedCents).toBe(54_000_000);
    // Después de los fijos quedan $156.300, menos que el piso de $189.900 (15 %): se usa el piso y la diferencia sale de los libres.
    expect(p.suggestedBudgets.Comida).toBe(10_400_000);
    expect(p.suggestedBudgets.Salidas).toBe(11_300_000);
    expect(p.fixedOverflowCents).toBe(0);
  });

  it("si los fijos no entran, el faltante sale de los libres y no del ahorro", () => {
    const p = buildMoneyPlan({ ...base, rentCents: 65_000_000 });
    expect(p.fixedOverflowCents).toBe(9_370_000);
    // Comida, traslados, etc. conservan un piso del 15 % del neto ($189.900); el faltante sale de los libres.
    expect(p.suggestedBudgets.Comida).toBe(10_400_000);
    const wantsTotal = ["Salidas", "Ropa", "Suscripciones", "Regalos", "Deporte", "Otros"].reduce((s, c) => s + p.suggestedBudgets[c], 0);
    expect(Math.abs(wantsTotal - (31_650_000 - 28_360_000))).toBeLessThan(400_000);
    expect(p.blocks.find((b) => b.key === "savings")?.plannedCents).toBe(25_320_000);
    expect(p.tips.map((t) => t.key)).toEqual(expect.arrayContaining(["fixed-over", "rent"]));
    expect(p.indicators.find((i) => i.key === "rent")?.tone).toBe("bad");
  });

  it("indicadores: cuotas, ahorro proyectado y fondo de emergencia", () => {
    const p = buildMoneyPlan({
      ...base,
      cuotasCents: 16_000_000,
      spentByCategory: { Comida: 20_000_000, Salidas: 15_000_000 },
      emergencySavedCents: 69_630_000,
      hasEmergencyGoal: true,
    });
    expect(p.indicators.find((i) => i.key === "cuotas")).toMatchObject({ value: "13 %", tone: "warn" });
    // Variable a mitad de mes: $350.000 → proyectado $700.000; ahorro = 1.266.000 − 650.000 − 700.000 < 0.
    expect(p.projectedSavingsCents).toBe(126_600_000 - 65_000_000 - 70_000_000);
    expect(p.tips.find((t) => t.key === "pay-yourself")?.tone).toBe("bad");
    expect(p.emergency).toMatchObject({ targetCents: 208_890_000, months: 1 });
    expect(p.indicators.find((i) => i.key === "emergency")?.value).toBe("1 mes");
  });

  it("a principio de mes proyecta con el promedio de meses anteriores", () => {
    const p = buildMoneyPlan({ ...base, dayOfMonth: 2, spentByCategory: { Comida: 1_000_000 }, avgVariableCents: 50_000_000 });
    expect(p.projectedSavingsCents).toBe(126_600_000 - 54_000_000 - 50_000_000);
  });

  it("plata quieta: lo que sobra en la cuenta después de lo que falta gastar y un colchón", () => {
    const p = buildMoneyPlan({ ...base, operatingBalanceCents: 200_000_000, spentByCategory: { Comida: 30_000_000 } });
    // Falta gastar 1.012.800 − 300.000 = 712.800; colchón 126.600 → sobran 1.160.600.
    expect(p.idle.cents).toBe(200_000_000 - 71_280_000 - 12_660_000);
    expect(p.idle.monthlyLossCents).toBe(Math.round(p.idle.cents * 0.022));
    expect(p.tips.some((t) => t.key === "idle")).toBe(true);
  });

  it("porcentajes propios y sin presupuesto cargado", () => {
    expect(normalizeSplit({ needs: 60, wants: 20, savings: 20 })).toEqual({ needs: 0.6, wants: 0.2, savings: 0.2 });
    const p = buildMoneyPlan({ ...base, split: { needs: 0.6, wants: 0.15, savings: 0.25 }, hasBudgets: false });
    expect(p.blocks.find((b) => b.key === "savings")?.plannedCents).toBe(31_650_000);
    expect(p.tips.some((t) => t.key === "budgets")).toBe(true);
  });
});
