import { describe, expect, it } from "vitest";
import { loadDemo } from "@/lib/data/context";
import { buildCashflowInput, buildDashboard, nextIncome } from "./dashboard";
import { projectCashflow } from "@/lib/finance";

/** Caso real: entró a trabajar el 18/11, cobra el 3.er día hábil. */
function ctxFor(today: string) {
  const ctx = loadDemo(today);
  return {
    ...ctx,
    netIncomeCents: 1_000_000_00,
    profile: { ...ctx.profile!, hireDate: "2026-11-18" },
    settings: { ...ctx.settings, paydayBusinessDay: 3 },
  };
}

const incomeIn = (ctx: ReturnType<typeof ctxFor>, month: string) =>
  projectCashflow(buildCashflowInput(ctx)).months.find((m) => m.month === month)!.incomeCents;

describe("sueldo y aguinaldo en el flujo de caja", () => {
  it("noviembre sin cobro, diciembre proporcional + aguinaldo proporcional, enero completo", () => {
    const ctx = ctxFor("2026-11-24");
    expect(incomeIn(ctx, "2026-11")).toBe(0);
    expect(incomeIn(ctx, "2026-12")).toBe(433_333_33 + Math.round((500_000_00 * 44) / 184));
    expect(incomeIn(ctx, "2027-01")).toBe(1_000_000_00);
  });

  it("el día de cobro todavía cuenta como pendiente; al día siguiente ya no", () => {
    expect(incomeIn(ctxFor("2026-12-03"), "2026-12")).toBe(433_333_33 + Math.round((500_000_00 * 44) / 184));
    expect(incomeIn(ctxFor("2026-12-04"), "2026-12")).toBe(Math.round((500_000_00 * 44) / 184));
    expect(incomeIn(ctxFor("2026-12-19"), "2026-12")).toBe(0);
  });

  it("próximo cobro en el tablero", () => {
    const n = nextIncome(ctxFor("2026-11-24"));
    expect(n.salary).toMatchObject({ date: "2026-12-03", amountCents: 433_333_33, days: 13 });
    expect(n.prorated).toBe(true);
    expect(n.sac?.date).toBe("2026-12-18");
    expect(buildDashboard(ctxFor("2026-12-10")).safe.netIncomeCents).toBe(433_333_33);
  });
});
