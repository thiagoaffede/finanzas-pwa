import type { BillProvider, ISODate, PaymentMethod, YearMonth } from "@/types/finance";
import type { PayslipTotals, ScaleEntry } from "@/lib/finance/commerce-union";
import type { IndexData, RentContract } from "@/lib/finance/rent-adjustment";
import { addMonths, lastDayOfMonth, monthOf, monthRange } from "@/lib/finance/dates";
import { estimateCommerceSalary, findScale } from "@/lib/finance/commerce-union";
import { installmentPlan } from "@/lib/finance/cashflow";
import { getDb, hasDatabase } from "@/lib/db";
import type { Db } from "./db-type";
import * as repo from "./repository";
import * as demo from "@/lib/demo-data";

/**
 * Todo lo que las pantallas necesitan, en un solo modelo.
 * Con base de datos sale de Neon; sin base, de los datos de ejemplo.
 */

export interface BillView {
  id: string;
  provider: BillProvider;
  period: YearMonth;
  dueDate: ISODate;
  amountCents: number;
  paid: boolean;
}

export interface TxView {
  id: string;
  date: ISODate;
  description: string;
  category: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
  installments: number;
  owedByName?: string;
  owedCents: number;
  reimbursedCents: number;
}

export interface InstallmentView {
  month: YearMonth;
  dueDate: ISODate;
  label: string;
  amountCents: number;
}

export interface GoalView {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  monthlyContributionCents: number;
  targetDate: ISODate | null;
}

export type IncomeSource = "manual" | "recibo" | "estimado" | "ejemplo" | "sin datos";

export interface FinanceContext {
  demo: boolean;
  today: ISODate;
  month: YearMonth;
  settings: repo.AppSettings;
  scales: ScaleEntry[];
  profile: repo.PayrollProfile | null;
  payslips: PayslipTotals[];
  rent: (RentContract & { dueDay: number }) | null;
  indices: IndexData;
  bills: BillView[];
  billHistory: Partial<Record<BillProvider, { period: YearMonth; amountCents: number }[]>>;
  transactions: TxView[];
  installments: InstallmentView[];
  goals: GoalView[];
  /** Gasto variable mensual promedio (para proyectar). */
  avgVariableSpendCents: number;
  netIncomeCents: number;
  netIncomeSource: IncomeSource;
}

/** Gastos que no son "variables del día a día": se pagan como cuota o resumen. */
export function isVariableSpend(t: { paymentMethod: PaymentMethod }) {
  return t.paymentMethod !== "cuotas" && t.paymentMethod !== "tarjeta";
}

export function seniorityYears(hireDate: ISODate, today: ISODate): number {
  const [hy, hm, hd] = hireDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let years = ty - hy;
  if (tm < hm || (tm === hm && td < hd)) years--;
  return Math.max(0, years);
}

export function resolveNetIncome(
  settings: repo.AppSettings,
  payslips: PayslipTotals[],
  profile: repo.PayrollProfile | null,
  scales: ScaleEntry[],
  today: ISODate,
): { cents: number; source: IncomeSource } {
  if (settings.netIncomeCents !== null) return { cents: settings.netIncomeCents, source: "manual" };
  if (payslips.length) return { cents: payslips[0].netCents, source: "recibo" };
  if (profile && findScale(scales, profile.category, today)) {
    const e = estimateCommerceSalary({
      scales,
      category: profile.category,
      date: today,
      seniorityYears: seniorityYears(profile.hireDate, today),
      weeklyHours: profile.weeklyHours,
      config: profile.configOverrides ?? undefined,
    });
    return { cents: e.netCents, source: "estimado" };
  }
  return { cents: 0, source: "sin datos" };
}

export async function loadFinanceContext(today: ISODate): Promise<FinanceContext> {
  return hasDatabase() ? loadFromDb(getDb(), today) : loadDemo(today);
}

export async function loadFromDb(db: Db, today: ISODate): Promise<FinanceContext> {
  const month = monthOf(today);
  const [settings, scales, profile, payslipRows, rent, indices, billRows, txRows, inst, goalRows, prevTx] = await Promise.all([
    repo.getSettings(db),
    repo.listScales(db),
    repo.getPayrollProfile(db),
    repo.listPayslips(db, 12),
    repo.getActiveRentContract(db),
    repo.getIndices(db),
    repo.listBills(db, { from: `${addMonths(month, -13)}-01` }),
    repo.listTransactions(db, { month }),
    repo.listInstallments(db, `${month}-01`),
    repo.listGoals(db),
    repo.listTransactions(db, { from: `${addMonths(month, -3)}-01`, to: lastDayOfMonth(addMonths(month, -1)) }),
  ]);

  const payslips: PayslipTotals[] = payslipRows.map((p) => ({
    period: p.period,
    remunerativeCents: p.remunerativeCents,
    nonRemunerativeCents: p.nonRemunerativeCents,
    deductionsCents: p.deductionsCents,
    netCents: p.netCents,
  }));

  const allBills: BillView[] = billRows.map((b) => ({
    id: b.id,
    provider: b.provider,
    period: b.billingPeriod,
    dueDate: b.dueDate,
    amountCents: b.amountCents,
    paid: b.status === "paid",
  }));
  const billHistory: FinanceContext["billHistory"] = {};
  for (const b of allBills) (billHistory[b.provider] ??= []).push({ period: b.period, amountCents: b.amountCents });
  // En pantalla: lo impago y lo que vence este mes.
  const bills = allBills.filter((b) => !b.paid || monthOf(b.dueDate) === month);

  const prevMonths = new Set(monthRange(addMonths(month, -3), 3));
  const prevVariable = prevTx.filter((t) => !t.isIncome && isVariableSpend(t) && prevMonths.has(monthOf(t.date)));
  const monthsWithData = new Set(prevVariable.map((t) => monthOf(t.date))).size;
  const avgVariableSpendCents = monthsWithData
    ? Math.round(prevVariable.reduce((s, t) => s + t.amountCents - t.owedCents, 0) / monthsWithData)
    : 0;

  const income = resolveNetIncome(settings, payslips, profile, scales, today);

  return {
    demo: false,
    today,
    month,
    settings,
    scales,
    profile,
    payslips,
    rent,
    indices,
    bills,
    billHistory,
    transactions: txRows
      .filter((t) => !t.isIncome)
      .map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description ?? t.category ?? "Gasto",
        category: t.category ?? "Otros",
        amountCents: t.amountCents,
        paymentMethod: t.paymentMethod,
        installments: t.installmentsCount,
        owedByName: t.owedByName ?? undefined,
        owedCents: t.owedCents,
        reimbursedCents: t.reimbursedCents,
      })),
    installments: inst.map((i) => ({
      month: monthOf(i.dueDate),
      dueDate: i.dueDate,
      label: `${i.label} (${i.number}/${i.total})`,
      amountCents: i.amountCents,
    })),
    goals: goalRows.map((g) => ({
      id: g.id,
      name: g.name,
      targetCents: g.targetCents,
      savedCents: g.savedCents,
      monthlyContributionCents: g.monthlyContributionCents ?? 0,
      targetDate: g.targetDate,
    })),
    avgVariableSpendCents,
    netIncomeCents: income.cents,
    netIncomeSource: income.source,
  };
}

export function loadDemo(today: ISODate): FinanceContext {
  const month = monthOf(today);
  const bills = demo.demoBills(today);
  return {
    demo: true,
    today,
    month,
    settings: {
      ...repo.DEFAULT_SETTINGS,
      monthlyInflation: demo.DEMO_SETTINGS.monthlyInflation,
      monthlyAlternativeRate: demo.DEMO_SETTINGS.monthlyAlternativeRate,
      bufferCents: demo.DEMO_SETTINGS.bufferCents,
      openingBalanceCents: 18_000_000,
      minBalanceCents: 5_000_000,
    },
    scales: demo.demoScales(today),
    profile: { category: "AUXILIAR_C", hireDate: `${Number(today.slice(0, 4)) - 3}-03-01`, weeklyHours: 48, configOverrides: null },
    payslips: [
      { period: addMonths(month, -1), remunerativeCents: 118_720_000, nonRemunerativeCents: 4_520_000, deductionsCents: 22_480_000, netCents: 100_760_000 },
    ],
    rent: { ...demo.demoRentContract(today), dueDay: 10 },
    indices: demo.demoIndices(today),
    bills: bills.map((b) => ({ id: b.id, provider: b.provider, period: b.period, dueDate: b.dueDate, amountCents: b.amountCents, paid: b.paid })),
    billHistory: {
      CAMUZZI: [...demo.demoGasHistory(today), ...bills.filter((b) => b.provider === "CAMUZZI").map((b) => ({ period: b.period, amountCents: b.amountCents }))],
    },
    transactions: demo.demoTransactions(today).map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      category: t.category,
      amountCents: t.amountCents,
      paymentMethod: t.paymentMethod,
      installments: t.installments ?? 1,
      owedByName: t.owedByName,
      owedCents: t.owedCents ?? 0,
      reimbursedCents: 0,
    })),
    installments: demo
      .demoInstallmentPlans(today)
      .flatMap(installmentPlan)
      .filter((i) => i.month >= month)
      .map((i) => ({ month: i.month, dueDate: `${i.month}-22`, label: i.label, amountCents: i.amountCents })),
    goals: demo.demoGoals().map((g) => ({ ...g, targetDate: null })),
    avgVariableSpendCents: 33_000_000,
    netIncomeCents: demo.DEMO_NET_INCOME_CENTS,
    netIncomeSource: "ejemplo",
  };
}
