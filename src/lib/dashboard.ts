import type { ISODate } from "@/types/finance";
import {
  addMonths,
  calculateSafeToSpend,
  detectBillAnomaly,
  groupDueItems,
  monthOf,
  monthRange,
  nextRentAdjustment,
  projectCashflow,
  rentByMonth,
  rentAt,
  installmentPlan,
} from "@/lib/finance";
import * as demo from "@/lib/demo-data";
import { monthLabel } from "@/lib/labels";

/**
 * Arma el modelo del tablero. Hoy usa datos de ejemplo; al conectar la base,
 * cada `demo.*` se reemplaza por la consulta correspondiente (ver docs/domain-rules.md).
 */
export function buildDashboard(today: ISODate) {
  const month = monthOf(today);
  const contract = demo.demoRentContract(today);
  const indices = demo.demoIndices(today);
  const opts = { projectedMonthlyInflation: demo.DEMO_SETTINGS.monthlyInflation };
  const rentNow = rentAt(contract, indices, today, opts);

  const dueItems = demo.demoDueItems(today, rentNow);
  const installmentsThisMonth = demo
    .demoInstallmentPlans(today)
    .flatMap(installmentPlan)
    .filter((i) => i.month === month);
  const goals = demo.demoGoals();
  const goalContributionsCents = goals.reduce((s, g) => s + g.monthlyContributionCents, 0);
  const transactions = demo.demoTransactions(today);
  // Gasto variable del mes: compras de contado/débito. Las cuotas y la tarjeta ya cuentan como obligación.
  const spentSoFarCents = transactions
    .filter((t) => t.paymentMethod !== "cuotas" && t.paymentMethod !== "tarjeta")
    .reduce((s, t) => s + t.amountCents - (t.owedCents ?? 0), 0);

  const safe = calculateSafeToSpend({
    today,
    netIncomeCents: demo.DEMO_NET_INCOME_CENTS,
    obligations: [
      ...dueItems.filter((d) => d.kind !== "card").map((d) => ({ label: d.label, amountCents: d.amountCents, dueDate: d.dueDate, paid: d.paid })),
      ...installmentsThisMonth.map((i) => ({ label: i.label, amountCents: i.amountCents, dueDate: `${month}-22`, paid: false })),
    ],
    goalContributionsCents,
    spentSoFarCents,
    bufferCents: demo.DEMO_SETTINGS.bufferCents,
  });

  const months = monthRange(month, 6);
  const cashflow = projectCashflow(demo.demoCashflowInput(today, rentByMonth(contract, indices, months, opts)));
  const nextRent = nextRentAdjustment(contract, indices, today, opts);

  const gasHistory = demo.demoGasHistory(today);
  const gasBill = demo.demoBills(today).find((b) => b.provider === "CAMUZZI")!;
  const gasAnomaly = detectBillAnomaly(gasHistory, { period: gasBill.period, amountCents: gasBill.amountCents }, { monthlyInflation: demo.DEMO_SETTINGS.monthlyInflation });

  return {
    today,
    month,
    safe,
    due: groupDueItems(dueItems, today),
    cashflow,
    nextRent,
    rentNow,
    anomalies: gasAnomaly.isAnomaly ? [{ label: `Camuzzi (${monthLabel(gasBill.period)})`, ...gasAnomaly }] : [],
    goals,
    previousMonth: addMonths(month, -1),
  };
}
