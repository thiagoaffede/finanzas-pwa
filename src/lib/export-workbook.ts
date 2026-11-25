import { asc, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import type { Db } from "@/lib/data/db-type";
import * as repo from "@/lib/data/repository";
import { billLabel, type FinanceContext } from "@/lib/data/context";
import { addMonths, buildMonthlyReport, monthOf } from "@/lib/finance";
import type { XlsxSheet } from "./xlsx";

/** Datos que van al Excel, igual con base o con los datos de ejemplo. */
export interface WorkbookData {
  month: string;
  monthlyInflation: number;
  ipc: { month: string; rate: number }[];
  accounts: { id: string; name: string; kind: string; currency: string; balanceCents: number; closingDay: number | null; dueDay: number | null }[];
  movements: {
    date: string;
    description: string;
    category: string | null;
    isIncome: boolean;
    amountCents: number;
    accountId: string | null;
    paymentMethod: string;
    installments: number;
    owedCents: number;
    reimbursedCents: number;
    salaryPeriod: string | null;
    billPayment: boolean;
    notes: string | null;
  }[];
  bills: { label: string; period: string; dueDate: string; amountCents: number; paid: boolean; paidAt: string | null; recurring: boolean; recurrenceMonths: number; category: string | null }[];
  installments: { description: string; accountId: string | null; number: number; total: number; dueDate: string; amountCents: number; paid: boolean }[];
  transfers: { date: string; fromAccountId: string; toAccountId: string; amountCents: number; toAmountCents: number | null; note: string | null }[];
  goals: { name: string; currency: string; targetCents: number; savedCents: number; monthlyContributionCents: number | null; targetDate: string | null }[];
  salaries: { period: string | null; date: string; amountCents: number; accountName: string | null }[];
}

const METHOD: Record<string, string> = { contado: "Efectivo/contado", debito: "Débito", tarjeta: "Tarjeta (1 pago)", cuotas: "Tarjeta en cuotas", transferencia: "Transferencia" };
const KIND: Record<string, string> = { efectivo: "Efectivo", banco: "Banco", billetera: "Billetera virtual", tarjeta: "Tarjeta", reserva: "Reserva/ahorro" };
const pesos = (c: number | null | undefined) => (c === null || c === undefined ? null : c / 100);

export async function workbookFromDb(db: Db, month: string): Promise<WorkbookData> {
  const [settings, indices, accounts, txs, bills, inst, transfers, goals, salaries] = await Promise.all([
    repo.getSettings(db),
    repo.getIndices(db),
    repo.listAccounts(db),
    db.select().from(s.transactions).orderBy(asc(s.transactions.date)),
    db.select().from(s.bills).orderBy(asc(s.bills.dueDate)),
    db
      .select({
        description: s.transactions.description,
        category: s.transactions.category,
        accountId: s.transactions.accountId,
        number: s.installments.number,
        total: s.installments.total,
        dueDate: s.installments.dueDate,
        amountCents: s.installments.amountCents,
        paid: s.installments.paid,
      })
      .from(s.installments)
      .innerJoin(s.transactions, eq(s.installments.transactionId, s.transactions.id))
      .orderBy(asc(s.installments.dueDate)),
    db.select().from(s.transfers).orderBy(asc(s.transfers.date)),
    repo.listGoals(db),
    repo.listSalaryHistory(db, 120),
  ]);
  return {
    month,
    monthlyInflation: settings.monthlyInflation,
    ipc: indices.ipc ?? [],
    accounts,
    movements: txs.map((t) => ({
      date: t.date,
      description: t.description ?? t.item ?? "",
      category: t.category,
      isIncome: t.isIncome,
      amountCents: t.amountCents,
      accountId: t.accountId,
      paymentMethod: t.paymentMethod,
      installments: t.installmentsCount,
      owedCents: t.owedCents,
      reimbursedCents: t.reimbursedCents,
      salaryPeriod: t.salaryPeriod,
      billPayment: Boolean(t.billId),
      notes: t.notes,
    })),
    bills: bills.map((b) => ({
      label: billLabel(b),
      period: b.billingPeriod,
      dueDate: b.dueDate,
      amountCents: b.amountCents,
      paid: b.status === "paid",
      paidAt: b.paidAt,
      recurring: b.recurring,
      recurrenceMonths: b.recurrenceMonths,
      category: b.category,
    })),
    installments: inst.map((i) => ({ ...i, description: i.description ?? i.category ?? "Compra" })),
    transfers,
    goals: goals.map((g) => ({ name: g.name, currency: g.currency, targetCents: g.targetCents, savedCents: g.savedCents, monthlyContributionCents: g.monthlyContributionCents, targetDate: g.targetDate })),
    salaries,
  };
}

export function workbookFromContext(ctx: FinanceContext): WorkbookData {
  return {
    month: ctx.month,
    monthlyInflation: ctx.settings.monthlyInflation,
    ipc: ctx.indices.ipc ?? [],
    accounts: ctx.accounts,
    movements: ctx.movements.map((t) => ({
      date: t.date,
      description: t.description,
      category: t.category,
      isIncome: Boolean(t.isIncome),
      amountCents: t.amountCents,
      accountId: t.accountId ?? null,
      paymentMethod: t.paymentMethod,
      installments: t.installments,
      owedCents: t.owedCents,
      reimbursedCents: t.reimbursedCents,
      salaryPeriod: t.salaryPeriod ?? null,
      billPayment: Boolean(t.billId),
      notes: null,
    })),
    bills: ctx.bills.map((b) => ({ label: b.label, period: b.period, dueDate: b.dueDate, amountCents: b.amountCents, paid: b.paid, paidAt: null, recurring: b.recurring, recurrenceMonths: b.recurrenceMonths, category: b.category })),
    installments: ctx.cardPurchases.flatMap((p) => p.pending.map((q) => ({ description: p.description, accountId: p.accountId, number: q.number, total: p.total, dueDate: q.dueDate, amountCents: q.amountCents, paid: false }))),
    transfers: ctx.transfers,
    goals: ctx.goals.map((g) => ({ ...g, monthlyContributionCents: g.monthlyContributionCents || null })),
    salaries: ctx.salaryHistory,
  };
}

/** Las hojas del Excel: movimientos, servicios, cuotas, cuentas, transferencias, objetivos, sueldos y resumen mensual. */
export function workbookSheets(d: WorkbookData): XlsxSheet[] {
  const acc = new Map(d.accounts.map((a) => [a.id, a]));
  const accName = (id: string | null) => (id ? (acc.get(id)?.name ?? "(cuenta borrada)") : "");
  const accCur = (id: string | null) => (id ? (acc.get(id)?.currency ?? "ARS") : "ARS");

  const report = buildMonthlyReport(
    d.month,
    d.movements.map((m) => ({ date: m.date, amountCents: m.amountCents, isIncome: m.isIncome, category: m.category ?? "Otros", owedCents: m.owedCents })),
    new Map(d.ipc.map((p) => [p.month, p.rate])),
    d.monthlyInflation,
    24,
  );
  const firstMonth = d.movements.length ? monthOf(d.movements[0].date) : d.month;
  const months = report.months.filter((m) => m.month >= firstMonth || m.month >= addMonths(d.month, -11));

  type M = WorkbookData["movements"][number];
  type B = WorkbookData["bills"][number];
  type I = WorkbookData["installments"][number];
  type A = WorkbookData["accounts"][number];
  type T = WorkbookData["transfers"][number];
  type G = WorkbookData["goals"][number];
  type S = WorkbookData["salaries"][number];
  type R = (typeof months)[number];

  const sheets: [XlsxSheet<M>, XlsxSheet<B>, XlsxSheet<I>, XlsxSheet<A>, XlsxSheet<T>, XlsxSheet<G>, XlsxSheet<S>, XlsxSheet<R>] = [
    {
      name: "Movimientos",
      rows: d.movements,
      columns: [
        { header: "Fecha", type: "date", value: (m) => m.date },
        { header: "Tipo", width: 10, value: (m) => (m.isIncome ? "Ingreso" : "Gasto") },
        { header: "Descripción", width: 30, value: (m) => m.description },
        { header: "Categoría", value: (m) => m.category },
        { header: "Importe", type: "money", value: (m) => pesos(m.isIncome ? m.amountCents : -m.amountCents) },
        { header: "Moneda", width: 8, value: (m) => accCur(m.accountId) },
        { header: "Cuenta", value: (m) => accName(m.accountId) },
        { header: "Forma de pago", value: (m) => METHOD[m.paymentMethod] ?? m.paymentMethod },
        { header: "Cuotas", type: "number", width: 8, value: (m) => (m.installments > 1 ? m.installments : null) },
        { header: "Te deben", type: "money", value: (m) => pesos(m.owedCents || null) },
        { header: "Te devolvieron", type: "money", value: (m) => pesos(m.reimbursedCents || null) },
        { header: "Sueldo de", width: 10, value: (m) => m.salaryPeriod },
        { header: "Pago de vencimiento", width: 10, value: (m) => (m.billPayment ? "Sí" : "") },
        { header: "Notas", width: 30, value: (m) => m.notes },
      ],
    },
    {
      name: "Servicios y fijos",
      rows: d.bills,
      columns: [
        { header: "Concepto", width: 24, value: (b) => b.label },
        { header: "Período", width: 10, value: (b) => b.period },
        { header: "Vence", type: "date", value: (b) => b.dueDate },
        { header: "Importe", type: "money", value: (b) => pesos(b.amountCents) },
        { header: "Estado", width: 10, value: (b) => (b.paid ? "Pagado" : "Pendiente") },
        { header: "Pagado el", type: "date", value: (b) => b.paidAt },
        { header: "Se repite", width: 14, value: (b) => (b.recurring ? (b.recurrenceMonths === 1 ? "Mensual" : `Cada ${b.recurrenceMonths} meses`) : "") },
        { header: "Categoría", value: (b) => b.category ?? "Servicios" },
      ],
    },
    {
      name: "Cuotas",
      rows: d.installments,
      columns: [
        { header: "Compra", width: 28, value: (i) => i.description },
        { header: "Tarjeta", value: (i) => accName(i.accountId) },
        { header: "Cuota", width: 8, value: (i) => `${i.number}/${i.total}` },
        { header: "Vence", type: "date", value: (i) => i.dueDate },
        { header: "Importe", type: "money", value: (i) => pesos(i.amountCents) },
        { header: "Pagada", width: 8, value: (i) => (i.paid ? "Sí" : "No") },
      ],
    },
    {
      name: "Cuentas",
      rows: d.accounts,
      columns: [
        { header: "Cuenta", width: 24, value: (a) => a.name },
        { header: "Tipo", value: (a) => KIND[a.kind] ?? a.kind },
        { header: "Moneda", width: 8, value: (a) => a.currency },
        { header: "Saldo", type: "money", value: (a) => pesos(a.balanceCents) },
        { header: "Cierre", type: "number", width: 8, value: (a) => a.closingDay },
        { header: "Vencimiento", type: "number", width: 12, value: (a) => a.dueDay },
      ],
    },
    {
      name: "Transferencias",
      rows: d.transfers,
      columns: [
        { header: "Fecha", type: "date", value: (t) => t.date },
        { header: "Desde", value: (t) => accName(t.fromAccountId) },
        { header: "Hacia", value: (t) => accName(t.toAccountId) },
        { header: "Sale", type: "money", value: (t) => pesos(t.amountCents) },
        { header: "Moneda", width: 8, value: (t) => accCur(t.fromAccountId) },
        { header: "Entra", type: "money", value: (t) => pesos(t.toAmountCents ?? t.amountCents) },
        { header: "Moneda destino", width: 10, value: (t) => accCur(t.toAccountId) },
        { header: "Nota", width: 24, value: (t) => t.note },
      ],
    },
    {
      name: "Objetivos",
      rows: d.goals,
      columns: [
        { header: "Objetivo", width: 24, value: (g) => g.name },
        { header: "Moneda", width: 8, value: (g) => g.currency },
        { header: "Meta", type: "money", value: (g) => pesos(g.targetCents) },
        { header: "Ahorrado", type: "money", value: (g) => pesos(g.savedCents) },
        { header: "Avance", type: "percent", width: 10, value: (g) => (g.targetCents ? g.savedCents / g.targetCents : null) },
        { header: "Aporte mensual", type: "money", value: (g) => pesos(g.monthlyContributionCents) },
        { header: "Fecha meta", type: "date", value: (g) => g.targetDate },
      ],
    },
    {
      name: "Sueldos",
      rows: d.salaries,
      columns: [
        { header: "Mes trabajado", width: 14, value: (x) => x.period },
        { header: "Cobrado el", type: "date", value: (x) => x.date },
        { header: "Neto", type: "money", value: (x) => pesos(x.amountCents) },
        { header: "Cuenta", value: (x) => x.accountName },
      ],
    },
    {
      name: "Resumen mensual",
      rows: [...months].reverse(),
      columns: [
        { header: "Mes", width: 10, value: (m) => m.month },
        { header: "Ingresos", type: "money", value: (m) => pesos(m.incomeCents) },
        { header: "Gastos", type: "money", value: (m) => pesos(m.expenseCents) },
        { header: "Ahorro", type: "money", value: (m) => pesos(m.savingCents) },
        { header: "Inflación del mes", type: "percent", width: 12, value: (m) => m.ipc },
        { header: "IPC estimado", width: 10, value: (m) => (m.ipcEstimated ? "Sí" : "") },
        { header: `Ingresos en pesos de ${d.month}`, type: "money", width: 20, value: (m) => pesos(m.realIncomeCents) },
        { header: `Gastos en pesos de ${d.month}`, type: "money", width: 20, value: (m) => pesos(m.realExpenseCents) },
      ],
    },
  ];
  return sheets as XlsxSheet[];
}
