import type { BillProvider } from "@/types/finance";
import {
  addMonths,
  calculateSafeFromBalance,
  calculateSafeToSpend,
  daysInMonth,
  detectBillAnomaly,
  groupDueItems,
  monthRange,
  nextRentAdjustment,
  projectCashflow,
  rentAt,
  rentByMonth,
  sacPayment,
  salaryPayment,
  toISODate,
  lastDayOfMonth,
  type CashflowInput,
  type DueItem,
} from "@/lib/finance";
import { availableBalance, isVariableSpend, type FinanceContext } from "@/lib/data/context";
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

/** Datos para el calendario de cobro (día hábil de pago y fecha de ingreso). */
export function payrollInput(ctx: FinanceContext) {
  return { monthlyNetCents: ctx.netIncomeCents, hireDate: ctx.profile?.hireDate ?? null, paydayBusinessDay: ctx.settings.paydayBusinessDay };
}

/** Próximo cobro de sueldo (y aguinaldo si cae antes del siguiente sueldo). */
export function nextIncome(ctx: FinanceContext) {
  const pay = payrollInput(ctx);
  // El cobro es por la tarde: el mismo día todavía cuenta como pendiente.
  let salary = salaryPayment(ctx.month, pay);
  if (ctx.today > salary.date || salary.amountCents === 0) salary = salaryPayment(addMonths(ctx.month, 1), pay);
  const sac = [ctx.month, addMonths(ctx.month, 1)].map((m) => sacPayment(m, pay)).find((x) => x && x.date >= ctx.today) ?? null;
  return { salary, sac, prorated: salary.days < 30 };
}

/**
 * Entrada del flujo de caja. El saldo inicial es lo que tenés HOY, así que el mes en curso
 * solo suma lo que falta: boletas impagas, el resto del gasto variable, el alquiler si no venció,
 * las cuotas del mes y el sueldo si todavía no lo cobraste. Desde el mes que viene, todo completo.
 */
export function buildCashflowInput(ctx: FinanceContext, months = 6): CashflowInput {
  const window = monthRange(ctx.month, months);
  const next = addMonths(ctx.month, 1);
  const infl = ctx.settings.monthlyInflation;
  const grow = (c: number) => Math.round(c * (1 + infl));
  const pay = payrollInput(ctx);
  const spentThisMonth = ctx.transactions.filter(isVariableSpend).reduce((s, t) => s + t.amountCents - t.owedCents, 0);
  const variable = Math.max(ctx.avgVariableSpendCents, spentThisMonth);
  const services = latestBillsTotal(ctx);
  const rent = ctx.rent ? rentByMonth(ctx.rent, ctx.indices, window, rentOptions(ctx)) : new Map<string, number>();
  const goals = ctx.goals.filter((g) => g.monthlyContributionCents > 0 && g.savedCents < g.targetCents);
  const rentDue = ctx.rent ? dayOfMonth(ctx.month, ctx.rent.dueDay) : null;
  const unpaidBills = ctx.bills.filter((b) => !b.paid && b.dueDate.slice(0, 7) <= ctx.month).reduce((s, b) => s + b.amountCents, 0);
  const out = (kind: "bill" | "expense" | "goal" | "rent" | "installment", label: string, amountCents: number, month = ctx.month) =>
    ({ month, kind, direction: "out" as const, label, amountCents });

  // Mes en curso: solo lo pendiente.
  const thisMonth = [
    ...(unpaidBills ? [out("bill", "Boletas impagas", unpaidBills)] : []),
    ...(variable > spentThisMonth ? [out("expense", "Gastos variables (resto del mes)", variable - spentThisMonth)] : []),
    ...goals.map((g) => out("goal", g.name, g.monthlyContributionCents)),
    ...(rentDue && ctx.today <= rentDue && rent.get(ctx.month) ? [out("rent", "Alquiler", rent.get(ctx.month)!)] : []),
  ];

  return {
    startMonth: ctx.month,
    months,
    openingBalanceCents: availableBalance(ctx).cents,
    minBalanceCents: ctx.settings.minBalanceCents,
    recurring: [
      ...(services ? [{ kind: "bill" as const, direction: "out" as const, label: "Servicios", amountCents: grow(services), fromMonth: next, monthlyGrowth: infl, indexed: true }] : []),
      ...(variable ? [{ kind: "expense" as const, direction: "out" as const, label: "Gastos variables", amountCents: grow(variable), fromMonth: next, monthlyGrowth: infl, indexed: true }] : []),
      ...goals.map((g) => ({ kind: "goal" as const, direction: "out" as const, label: g.name, amountCents: g.monthlyContributionCents, fromMonth: next })),
    ],
    installmentPlans: [],
    oneOff: [
      ...thisMonth,
      ...ctx.installments.map((i) => out("installment", i.label, i.amountCents, i.month)),
      ...[...rent.entries()].filter(([month]) => month > ctx.month).map(([month, amountCents]) => out("rent", "Alquiler", amountCents, month)),
      // Sueldo: entra el N.º día hábil (el del mes anterior, proporcional si entraste a mitad de mes).
      // El del mes en curso cuenta si todavía no se cobró (el día de pago cuenta como pendiente).
      ...window
        .map((month) => ({ month, p: salaryPayment(month, pay) }))
        .filter(({ month, p }) => p.amountCents > 0 && (month > ctx.month || ctx.today <= p.date))
        .map(({ month, p }) => ({ month, kind: "income" as const, direction: "in" as const, label: p.days < 30 ? `Sueldo (${p.days} días)` : "Sueldo", amountCents: p.amountCents })),
      // Aguinaldo (SAC) estimado: medio sueldo proporcional a los días trabajados del semestre.
      ...window
        .map((month) => ({ month, sac: sacPayment(month, pay) }))
        .filter(({ month, sac }) => sac && (month > ctx.month || ctx.today <= sac.date))
        .map(({ month, sac }) => ({ month, kind: "income" as const, direction: "in" as const, label: "Aguinaldo (SAC)", amountCents: sac!.amountCents })),
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

  const obligations = items.map((d) => ({ label: d.label, amountCents: d.amountCents, dueDate: d.dueDate, paid: d.paid }));
  const paidThisMonth = salaryPayment(ctx.month, payrollInput(ctx)).amountCents;
  const cashAccounts = ctx.accounts.filter((a) => a.kind !== "tarjeta");
  const next = ctx.netIncomeCents > 0 ? nextIncome(ctx) : null;

  // Base del cálculo:
  // - "saldo": si cargaste cuentas, la plata que tenés hoy repartida hasta el próximo cobro.
  // - "sin-saldo": todavía no cobraste este mes y no hay cuentas: no hay con qué calcular.
  // - "sueldo": el sueldo del mes menos vencimientos, objetivos y lo ya gastado.
  const basis: "saldo" | "sin-saldo" | "sueldo" = cashAccounts.length ? "saldo" : !ctx.demo && paidThisMonth === 0 ? "sin-saldo" : "sueldo";
  const safe =
    basis === "sueldo"
      ? calculateSafeToSpend({
          today: ctx.today,
          netIncomeCents: paidThisMonth > 0 ? paidThisMonth : ctx.netIncomeCents,
          obligations,
          goalContributionsCents,
          spentSoFarCents,
          bufferCents: ctx.settings.bufferCents,
        })
      : calculateSafeFromBalance({
          today: ctx.today,
          balanceCents: basis === "saldo" ? availableBalance(ctx).cents : 0,
          untilDate: next?.salary.date ?? lastDayOfMonth(ctx.month),
          obligations,
          goalContributionsCents: basis === "saldo" ? goalContributionsCents : 0,
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
    nextIncome: next,
    basis,
  };
}
