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
import { PROVIDER_NAME } from "@/lib/labels";

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
  /** Archivo original guardado (PDF o foto). */
  documentId?: string | null;
  /** Nombre para mostrar ("EDES (luz)", "Gimnasio"). */
  label: string;
  /** Gasto fijo mensual (se proyecta todos los meses). */
  recurring: boolean;
  /** Serie para comparar con meses anteriores: el proveedor, o "OTRO:<nombre>". */
  series: string;
}

export function billLabel(b: { provider: BillProvider | string; providerLabel?: string | null }) {
  return b.provider === "OTRO" ? b.providerLabel || "Vencimiento" : (PROVIDER_NAME[b.provider] ?? b.provider);
}

export function billSeries(b: { provider: BillProvider | string; providerLabel?: string | null }) {
  return b.provider === "OTRO" ? `OTRO:${(b.providerLabel ?? "").trim().toLowerCase()}` : b.provider;
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
  isIncome?: boolean;
  accountId?: string | null;
  /** Pago de una boleta (no es gasto variable). */
  billId?: string | null;
  salaryPeriod?: string | null;
}

export interface TransferView {
  id: string;
  date: ISODate;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  note: string | null;
}

export interface SalaryRecord {
  id: string;
  period: YearMonth;
  date: ISODate;
  amountCents: number;
  accountName: string | null;
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
  payslips: (PayslipTotals & { documentId?: string | null })[];
  rent: (RentContract & { dueDay: number }) | null;
  indices: IndexData;
  bills: BillView[];
  /** Historial por serie (proveedor, o gasto fijo "OTRO:<nombre>"). */
  billHistory: Record<string, { period: YearMonth; amountCents: number }[]>;
  /** Gastos del mes (sin ingresos). */
  transactions: TxView[];
  /** Todos los movimientos del mes, ingresos incluidos (para la lista editable). */
  movements: TxView[];
  /** Sueldos cobrados y registrados. */
  salaryHistory: SalaryRecord[];
  /** Transferencias entre cuentas del mes. */
  transfers: TransferView[];
  installments: InstallmentView[];
  goals: GoalView[];
  accounts: repo.AccountView[];
  /** Gasto variable mensual promedio (para proyectar). */
  avgVariableSpendCents: number;
  netIncomeCents: number;
  netIncomeSource: IncomeSource;
}

/** Gastos que no son "variables del día a día": se pagan como cuota o resumen. */
export function isVariableSpend(t: { paymentMethod: PaymentMethod; billId?: string | null; isIncome?: boolean }) {
  return !t.isIncome && !t.billId && t.paymentMethod !== "cuotas" && t.paymentMethod !== "tarjeta";
}

/** Plata disponible hoy: suma de cuentas (sin tarjetas) si las cargaste; si no, el saldo de Configuración. */
export function availableBalance(ctx: Pick<FinanceContext, "accounts" | "settings">): { cents: number; source: "cuentas" | "configuracion" } {
  const cash = ctx.accounts.filter((a) => a.kind !== "tarjeta");
  if (cash.length) return { cents: cash.reduce((s, a) => s + a.balanceCents, 0), source: "cuentas" };
  return { cents: ctx.settings.openingBalanceCents, source: "configuracion" };
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
  const [settings, scales, profile, payslipRows, rent, indices, billRows, txRows, inst, goalRows, prevTx, accounts] = await Promise.all([
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
    repo.listAccounts(db),
  ]);
  const [salaryRows, transferRows] = await Promise.all([repo.listSalaryHistory(db), repo.listTransfers(db, month)]);

  const payslips: FinanceContext["payslips"] = payslipRows.map((p) => ({
    period: p.period,
    remunerativeCents: p.remunerativeCents,
    nonRemunerativeCents: p.nonRemunerativeCents,
    deductionsCents: p.deductionsCents,
    netCents: p.netCents,
    documentId: p.sourceDocumentId,
  }));

  const allBills: BillView[] = billRows.map((b) => ({
    id: b.id,
    provider: b.provider,
    period: b.billingPeriod,
    dueDate: b.dueDate,
    amountCents: b.amountCents,
    paid: b.status === "paid",
    documentId: b.sourceDocumentId,
    label: billLabel(b),
    recurring: b.recurring,
    series: billSeries(b),
  }));
  // Historial para proyectar y comparar: servicios conocidos y gastos fijos (no los vencimientos sueltos).
  const billHistory: FinanceContext["billHistory"] = {};
  for (const b of allBills) if (b.provider !== "OTRO" || b.recurring) (billHistory[b.series] ??= []).push({ period: b.period, amountCents: b.amountCents });
  // En pantalla: lo impago y lo que vence este mes.
  const bills = allBills.filter((b) => !b.paid || monthOf(b.dueDate) === month);

  const prevMonths = new Set(monthRange(addMonths(month, -3), 3));
  const prevVariable = prevTx.filter((t) => !t.isIncome && isVariableSpend(t) && prevMonths.has(monthOf(t.date)));
  const monthsWithData = new Set(prevVariable.map((t) => monthOf(t.date))).size;
  const avgVariableSpendCents = monthsWithData
    ? Math.round(prevVariable.reduce((s, t) => s + t.amountCents - t.owedCents, 0) / monthsWithData)
    : 0;

  const income = resolveNetIncome(settings, payslips, profile, scales, today);
  const movements: TxView[] = txRows.map((t) => ({
    id: t.id,
    date: t.date,
    description: t.description ?? t.category ?? (t.isIncome ? "Ingreso" : "Gasto"),
    category: t.category ?? "Otros",
    amountCents: t.amountCents,
    paymentMethod: t.paymentMethod,
    installments: t.installmentsCount,
    owedByName: t.owedByName ?? undefined,
    owedCents: t.owedCents,
    reimbursedCents: t.reimbursedCents,
    isIncome: t.isIncome,
    accountId: t.accountId,
    billId: t.billId,
    salaryPeriod: t.salaryPeriod,
  }));

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
    transactions: movements.filter((t) => !t.isIncome),
    movements,
    transfers: transferRows.map((t) => ({ id: t.id, date: t.date, fromAccountId: t.fromAccountId, toAccountId: t.toAccountId, amountCents: t.amountCents, note: t.note })),
    salaryHistory: salaryRows.map((r) => ({ id: r.id, period: r.period!, date: r.date, amountCents: r.amountCents, accountName: r.accountName })),
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
    accounts,
    avgVariableSpendCents,
    netIncomeCents: income.cents,
    netIncomeSource: income.source,
  };
}

export function loadDemo(today: ISODate): FinanceContext {
  const month = monthOf(today);
  const bills = demo.demoBills(today);
  const demoTx: TxView[] = demo.demoTransactions(today).map((t) => ({
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
    }));
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
    bills: bills.map((b) => ({ id: b.id, provider: b.provider, period: b.period, dueDate: b.dueDate, amountCents: b.amountCents, paid: b.paid, label: billLabel(b), recurring: false, series: billSeries(b) })),
    billHistory: {
      CAMUZZI: [...demo.demoGasHistory(today), ...bills.filter((b) => b.provider === "CAMUZZI").map((b) => ({ period: b.period, amountCents: b.amountCents }))],
    },
    transactions: demoTx,
    movements: demoTx,
    salaryHistory: [],
    transfers: [],
    installments: demo
      .demoInstallmentPlans(today)
      .flatMap(installmentPlan)
      .filter((i) => i.month >= month)
      .map((i) => ({ month: i.month, dueDate: `${i.month}-22`, label: i.label, amountCents: i.amountCents })),
    goals: demo.demoGoals().map((g) => ({ ...g, targetDate: null })),
    accounts: [],
    avgVariableSpendCents: 33_000_000,
    netIncomeCents: demo.DEMO_NET_INCOME_CENTS,
    netIncomeSource: "ejemplo",
  };
}
