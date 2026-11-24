import { describe, expect, it } from "vitest";
import { calculateSafeToSpend } from "./safe-to-spend";

const base = {
  today: "2026-11-21",
  netIncomeCents: 100_000_000, // $1.000.000
  obligations: [
    { label: "Alquiler", amountCents: 30_000_000, dueDate: "2026-11-10", paid: true },
    { label: "EDES", amountCents: 5_000_000, dueDate: "2026-11-25" },
    { label: "Camuzzi (diciembre)", amountCents: 9_000_000, dueDate: "2026-12-05" },
  ],
  goalContributionsCents: 10_000_000,
  spentSoFarCents: 40_000_000,
};

describe("safe-to-spend", () => {
  it("aplica la fórmula ingreso − vencimientos del mes − objetivos", () => {
    const r = calculateSafeToSpend(base);
    expect(r.obligationsCents).toBe(35_000_000); // ignora el vencimiento de diciembre
    expect(r.pendingObligationsCents).toBe(5_000_000);
    expect(r.availableMonthCents).toBe(55_000_000);
    expect(r.remainingCents).toBe(15_000_000);
    expect(r.daysLeft).toBe(10); // 21 al 30 de noviembre inclusive
    expect(r.perDayCents).toBe(1_500_000);
    expect(r.perWeekCents).toBe(10_500_000);
    expect(r.status).toBe("ok");
  });

  it("marca 'over' si ya te pasaste y no deja gastar más", () => {
    const r = calculateSafeToSpend({ ...base, spentSoFarCents: 60_000_000 });
    expect(r.remainingCents).toBe(-5_000_000);
    expect(r.perDayCents).toBe(0);
    expect(r.status).toBe("over");
  });

  it("marca 'tight' si vas gastando más rápido que el ritmo ideal", () => {
    const r = calculateSafeToSpend({ ...base, today: "2026-11-05", spentSoFarCents: 30_000_000 });
    expect(r.status).toBe("tight");
  });

  it("descuenta el colchón", () => {
    const r = calculateSafeToSpend({ ...base, bufferCents: 5_000_000 });
    expect(r.availableMonthCents).toBe(50_000_000);
  });
});
