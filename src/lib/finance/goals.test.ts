import { describe, expect, it } from "vitest";
import { planGoal } from "./goals";

describe("planGoal", () => {
  it("con fecha objetivo calcula el aporte mensual (incluye el mes actual)", () => {
    const p = planGoal({ targetCents: 120_000_000, savedCents: 20_000_000, today: "2026-11-24", targetDate: "2027-04-15", monthlyMarginCents: 50_000_000 });
    expect(p.monthsLeft).toBe(6);
    expect(p.monthlyNeededCents).toBe(16_666_667);
    expect(p.feasible).toBe(true);
    expect(p.pctOfMargin).toBeCloseTo(0.3333, 3);
  });

  it("con aporte mensual calcula cuándo se llega", () => {
    const p = planGoal({ targetCents: 120_000_000, savedCents: 20_000_000, today: "2026-11-24", monthlyContributionCents: 25_000_000 });
    expect(p.monthsLeft).toBe(4);
    expect(p.reachMonth).toBe("2027-02");
  });

  it("objetivo cumplido", () => {
    const p = planGoal({ targetCents: 100, savedCents: 150, today: "2026-11-24" });
    expect(p.remainingCents).toBe(0);
    expect(p.progress).toBe(1);
  });

  it("no factible si supera el margen", () => {
    const p = planGoal({ targetCents: 100_000, savedCents: 0, today: "2026-11-24", targetDate: "2026-11-30", monthlyMarginCents: 50_000 });
    expect(p.feasible).toBe(false);
  });
});
