import type { BillProvider } from "@/types/finance";
import {
  addMonths,
  calculateSafeToSpend,
  daysInMonth,
  detectBillAnomaly,
  groupDueItems,
  monthRange,
  nextRentAdjustment,
  projectCashflow,
  rentAt,
  rentByMonth,
  toISODate,
  type CashflowInput,
  type DueItem,
} from "@/lib/finance";
import { isVariableSpend, type FinanceContext } from "@/lib/data/context";
import { monthLabel, PROVIDER_NAME } from "@/lib/labels";

/** Arma los números del tablero a partir del contexto (base real o datos de ejemplo). */

function dayOfMonth(month: string, day: number) {
  const [y, m] = month.split("-").map(Number);
  return toISODate(y, m, Math.min(day, daysInMonth(month)));
}

export function rentOptions(ctx: FinanceContext) {
  return { projectedMonthlyInflation: ctx.settings.monthlyInflation };
}

export function currentRent(ctx: FinanceContext): number {
  return ctx.rent ? rentAt(ctx.rent, ctx.indices, ctx.today, rentOptions(ctx)) : 0;
}

export function dueItems(ctx: FinanceContext): DueItem[] {
  const items: DueItem[] = ctx.bills.map((b) => ({
    id: b.id,
    label: PROVIDER_NAME[b.provider] ?? b.provider,
    amountCents: b.amountCents,
    dueDate: b.dueDate,
    paid: b.paid,
    kind: "bill",
  }));
  if (ctx.rent) {
    const due = dayOfMonth(ctx.month, ctx.rent.dueDay);
    // El pago del alquiler no se registra todavía: se asume pagado pasado el día de vencimiento.
    items.push({ id: "rent", label: "Alquiler", amountCents: currentRent(ctx), dueDate: due, paid: ctx.today > due, kind: "rent" });
  }
  const inst = ctx.installments.filter((i) => i.month === ctx.month);
  if (inst.length) {
    items.push({
      id: "installments",
      label: `Cuotas del mes (${inst.length})`,
      amountCents: inst.reduce((s, i) => s + i.amountCents, 0),
      dueDate: inst.reduce((d, i) => (i.dueDate > d ? i.dueDate : d), inst[0].dueDate),
      paid: false,
      kind: "card",
    });
  }
  return items;
}

/** Suma de la última boleta de cada servicio: base para proyectar servicios. */
function latestBillsTotal(ctx: FinanceContext): number {
  const latest = new Map<BillProvider, { period: string; amountCents: number }>();
  for (const [p, hist] of Object.entries(ctx.billHistory) as [BillProvider, { period: string; amountCents: number }[]][]) {
    for (const h of hist) if (!latest.has(p) || h.period > latest.get(p)!.period) latest.set(p, h);
  }
  for (const b of ctx.bills) if (!latest.has(b.provider) || b.period > latest.get(b.provider)!.period) latest.set(b.provider, b);
  return [...latest.values()].reduce((s, b) => s + b.amountCents, 0);
}

export function buildCashflowInput(ctx: FinanceContext, months = 6): CashflowInput {
  const window = monthRange(ctx.month, months);
  const infl = ctx.settings.monthlyInflation;
  const spentThisMonth = ctx.transactions.filter(isVariableSpend).reduce((s, t) => s + t.amountCents - t.owedCents, 0);
  const variable = Math.max(ctx.avgVariableSpendCents, spentThisMonth);
  const services = latestBillsTotal(ctx);
  const rent = ctx.rent ? rentByMonth(ctx.rent, ctx.indices, window, rentOptions(ctx)) : new Map();

  return {
    startMonth: ctx.month,
    months,
    openingBalanceCents: ctx.settings.openingBalanceCents,
    minBalanceCents: ctx.settings.minBalanceCents,
    recurring: [
      { kind: "income", direction: "in", label: "Sueldo", amountCents: ctx.netIncomeCents, fromMonth: ctx.month },
      ...(services ? [{ kind: "bill" as const, direction: "out" as const, label: "Servicios", amountCents: services, fromMonth: ctx.month, monthlyGrowth: infl, indexed: true }] : []),
      ...(variable ? [{ kind: "expense" as const, direction: "out" as const, label: "Gastos variables", amountCents: variable, fromMonth: ctx.month, monthlyGrowth: infl, indexed: true }] : []),
      ...ctx.goals
        .filter((g) => g.monthlyContributionCents > 0 && g.savedCents < g.targetCents)
        .map((g) => ({ kind: "goal" as const, direction: "out" as const, label: g.name, amountCents: g.monthlyContributionCents, fromMonth: ctx.month })),
    ],
    installmentPlans: [],
    oneOff: [
      ...ctx.installments.map((i) => ({ month: i.month, kind: "installment" as const, direction: "out" as const, label: i.label, amountCents: i.amountCents })),
      ...[...rent.entries()].map(([month, amountCents]) => ({ month, kind: "rent" as const, direction: "out" as const, label: "Alquiler", amountCents })),
      // Aguinaldo (SAC) estimado: medio sueldo neto en junio y diciembre.
      ...window
        .filter((m) => m.endsWith("-06") || m.endsWith("-12"))
        .map((month) => ({ month, kind: "income" as const, direction: "in" as const, label: "Aguinaldo (SAC)", amountCents: Math.round(ctx.netIncomeCents / 2) })),
    ],
  };
}

export function billAnomalies(ctx: FinanceContext) {
  return ctx.bills
    .filter((b) => !b.paid)
    .map((b) => {
      const history = (ctx.billHistory[b.provider] ?? []).filter((h) => h.period !== b.period);
      const r = detectBillAnomaly(history, { period: b.period, amountCents: b.amountCents }, { monthlyInflation: ctx.settings.monthlyInflation });
      return { billId: b.id, label: `${PROVIDER_NAME[b.provider] ?? b.provider} (${monthLabel(b.period)})`, ...r };
    });
}

export function buildDashboard(ctx: FinanceContext) {
  const items = dueItems(ctx);
  const goalContributionsCents = ctx.goals
    .filter((g) => g.savedCents < g.targetCents)
    .reduce((s, g) => s + g.monthlyContributionCents, 0);
  const spentSoFarCents = ctx.transactions
    .filter(isVariableSpend)
    .reduce((s, t) => s + t.amountCents - t.owedCents, 0);

  const safe = calculateSafeToSpend({
    today: ctx.today,
    netIncomeCents: ctx.netIncomeCents,
    obligations: items.map((d) => ({ label: d.label, amountCents: d.amountCents, dueDate: d.dueDate, paid: d.paid })),
    goalContributionsCents,
    spentSoFarCents,
    bufferCents: ctx.settings.bufferCents,
  });

  return {
    today: ctx.today,
    month: ctx.month,
    safe,
    due: groupDueItems(items, ctx.today),
    cashflow: projectCashflow(buildCashflowInput(ctx)),
    nextRent: ctx.rent ? nextRentAdjustment(ctx.rent, ctx.indices, ctx.today, rentOptions(ctx)) : null,
    rentNow: currentRent(ctx),
    anomalies: billAnomalies(ctx).filter((a) => a.isAnomaly),
    goals: ctx.goals,
    previousMonth: addMonths(ctx.month, -1),
    netIncomeSource: ctx.netIncomeSource,
  };
}
