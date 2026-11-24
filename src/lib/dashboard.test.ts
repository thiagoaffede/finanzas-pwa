import { describe, expect, it } from "vitest";
import { loadDemo, type FinanceContext } from "@/lib/data/context";
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

describe("cuánto puedo gastar sin cobro este mes", () => {
  const base = () => {
    const c = ctxFor("2026-11-24");
    return { ...c, demo: false, bills: [], installments: [], goals: [], rent: null, transactions: [], settings: { ...c.settings, bufferCents: 0 } };
  };

  it("sin cuentas cargadas no inventa un monto", () => {
    const d = buildDashboard(base());
    expect(d.basis).toBe("sin-saldo");
    expect(d.safe.perDayCents).toBe(0);
  });

  it("con cuentas reparte la plata hasta el cobro del 3/12", () => {
    const account = { id: "a", name: "Banco", kind: "banco" as const, openingBalanceCents: 0, balanceSetAt: "", balanceCents: 300_000_00 };
    const card = { ...account, id: "t", kind: "tarjeta" as const, balanceCents: -50_000_00 };
    const ctx = { ...base(), accounts: [account, card], bills: [{ id: "b", provider: "EDES" as const, period: "2026-11", dueDate: "2026-11-28", amountCents: 50_000_00, paid: false, label: "EDES (luz)", recurring: false, series: "EDES" }] };
    const d = buildDashboard(ctx);
    expect(d.basis).toBe("saldo");
    expect(d.safe.daysLeft).toBe(10); // 24/11 al 3/12 inclusive
    expect(d.safe.remainingCents).toBe(250_000_00);
    expect(d.safe.perDayCents).toBe(25_000_00);
  });
});

describe("gastos sueltos, vencimientos para más adelante y sueldo cobrado", () => {
  const base = () => {
    const c = ctxFor("2026-11-24");
    return { ...c, demo: false, billHistory: {}, installments: [], goals: [], rent: null, avgVariableSpendCents: 0 } as FinanceContext;
  };
  const months = (ctx: FinanceContext) => projectCashflow(buildCashflowInput(ctx)).months;
  const tx = { id: "t", date: "2026-11-20", description: "Gimnasio", category: "Deporte", amountCents: 40_000_00, paymentMethod: "debito" as const, installments: 1, owedCents: 0, reimbursedCents: 0 };

  it("un gasto suelto de este mes no se repite en los meses siguientes", () => {
    const m = months({ ...base(), bills: [], transactions: [tx] });
    expect(m.find((x) => x.month === "2027-01")!.byKind.expense ?? 0).toBe(0);
  });

  it("un vencimiento 'lo pago más adelante' entra una sola vez, en su mes", () => {
    const later = { id: "b", provider: "OTRO" as const, period: "2026-12", dueDate: "2026-12-03", amountCents: 40_000_00, paid: false, label: "Gimnasio", recurring: false, series: "OTRO:gimnasio" };
    const m = months({ ...base(), transactions: [], bills: [later] });
    expect(m.find((x) => x.month === "2026-12")!.byKind.bill).toBe(40_000_00);
    expect(m.find((x) => x.month === "2027-01")!.byKind.bill ?? 0).toBe(0);
  });

  it("un gasto fijo se proyecta todos los meses", () => {
    const gym = { id: "b", provider: "OTRO" as const, period: "2026-12", dueDate: "2026-12-10", amountCents: 40_000_00, paid: false, label: "Gimnasio", recurring: true, series: "OTRO:gimnasio" };
    const m = months({ ...base(), transactions: [], bills: [gym] });
    expect(m.find((x) => x.month === "2027-02")!.byKind.bill).toBeGreaterThan(40_000_00);
  });

  it("si ya registraste el sueldo, no se cuenta otra vez y el próximo cobro pasa al mes siguiente", () => {
    const ctx = { ...ctxFor("2026-12-03"), salaryHistory: [{ id: "s", period: "2026-11", date: "2026-12-03", amountCents: 430_000_00, accountName: "Banco" }] };
    expect(incomeIn(ctx, "2026-12")).toBe(Math.round((500_000_00 * 44) / 184));
    expect(nextIncome(ctx).salary.date).toBe("2027-01-06");
  });
});
