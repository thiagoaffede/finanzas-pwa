import type { Cents, YearMonth } from "@/types/finance";
import { addMonths, monthOf, monthRange } from "./dates";

/**
 * Reporte mensual: ingresos, gastos y ahorro, comparados con el mes anterior y con la inflación.
 * "Real" = expresado en pesos del mes del reporte (se ajusta por IPC mes a mes).
 * Si falta el IPC de un mes se usa la inflación estimada de Configuración y se marca como estimado.
 */

export interface ReportTx {
  date: string;
  amountCents: Cents;
  isIncome: boolean;
  category: string | null;
  owedCents?: Cents;
}

export interface ReportMonth {
  month: YearMonth;
  incomeCents: Cents;
  expenseCents: Cents;
  savingCents: Cents;
  /** Inflación del mes (IPC). */
  ipc: number;
  ipcEstimated: boolean;
  /** En pesos del mes del reporte. */
  realIncomeCents: Cents;
  realExpenseCents: Cents;
}

export interface CategoryChange {
  category: string;
  cents: Cents;
  prevCents: Cents;
  /** Variación nominal contra el mes anterior (null si el anterior fue 0). */
  change: number | null;
  /** Variación descontando la inflación del mes. */
  realChange: number | null;
  share: number;
}

export interface MonthlyReport {
  month: YearMonth;
  months: ReportMonth[];
  current: ReportMonth;
  previous: ReportMonth | null;
  savingsRate: number | null;
  incomeChange: number | null;
  incomeRealChange: number | null;
  expenseChange: number | null;
  expenseRealChange: number | null;
  categories: CategoryChange[];
  /** Inflación acumulada en la ventana (12 meses). */
  inflation12m: number;
  /** Ingreso real del mes vs el primer mes con ingresos de la ventana. */
  purchasingPower: { fromMonth: YearMonth; change: number } | null;
  anyEstimated: boolean;
}

const pct = (a: number, b: number) => (b > 0 ? a / b - 1 : null);

export function buildMonthlyReport(month: YearMonth, txs: ReportTx[], ipc: Map<string, number>, fallbackInflation: number, windowMonths = 12): MonthlyReport {
  const months = monthRange(addMonths(month, -(windowMonths - 1)), windowMonths);
  const inc = new Map<string, number>();
  const exp = new Map<string, number>();
  const cat = new Map<string, Map<string, number>>();
  for (const t of txs) {
    const m = monthOf(t.date);
    if (t.isIncome) inc.set(m, (inc.get(m) ?? 0) + t.amountCents);
    else {
      const v = t.amountCents - (t.owedCents ?? 0);
      exp.set(m, (exp.get(m) ?? 0) + v);
      const c = t.category ?? "Otros";
      const byCat = cat.get(m) ?? cat.set(m, new Map()).get(m)!;
      byCat.set(c, (byCat.get(c) ?? 0) + v);
    }
  }

  const rateOf = (m: string) => (ipc.has(m) ? { r: ipc.get(m)!, est: false } : { r: fallbackInflation, est: true });
  // Factor para llevar pesos del mes i a pesos del mes del reporte.
  const factor = new Map<string, number>();
  let f = 1;
  for (let i = months.length - 1; i >= 0; i--) {
    factor.set(months[i], f);
    f *= 1 + rateOf(months[i]).r;
  }

  const rows: ReportMonth[] = months.map((m) => {
    const incomeCents = inc.get(m) ?? 0;
    const expenseCents = exp.get(m) ?? 0;
    const { r, est } = rateOf(m);
    return {
      month: m,
      incomeCents,
      expenseCents,
      savingCents: incomeCents - expenseCents,
      ipc: r,
      ipcEstimated: est,
      realIncomeCents: Math.round(incomeCents * factor.get(m)!),
      realExpenseCents: Math.round(expenseCents * factor.get(m)!),
    };
  });

  const current = rows[rows.length - 1];
  const previous = rows.length > 1 ? rows[rows.length - 2] : null;
  const realize = (nominal: number | null) => (nominal === null ? null : (1 + nominal) / (1 + current.ipc) - 1);

  const curCat = cat.get(month) ?? new Map<string, number>();
  const prevCat = previous ? (cat.get(previous.month) ?? new Map<string, number>()) : new Map<string, number>();
  const categories = [...new Set([...curCat.keys(), ...prevCat.keys()])]
    .map((c) => {
      const cents = curCat.get(c) ?? 0;
      const prevCents = prevCat.get(c) ?? 0;
      const change = pct(cents, prevCents);
      return { category: c, cents, prevCents, change, realChange: realize(change), share: current.expenseCents > 0 ? cents / current.expenseCents : 0 };
    })
    .sort((a, b) => b.cents - a.cents);

  const firstWithIncome = rows.find((r) => r.incomeCents > 0 && r.month !== month);
  const inflation12m = rows.slice(1).reduce((acc, r) => acc * (1 + r.ipc), 1) - 1;

  const incomeChange = previous ? pct(current.incomeCents, previous.incomeCents) : null;
  const expenseChange = previous ? pct(current.expenseCents, previous.expenseCents) : null;
  return {
    month,
    months: rows,
    current,
    previous,
    savingsRate: current.incomeCents > 0 ? current.savingCents / current.incomeCents : null,
    incomeChange,
    incomeRealChange: realize(incomeChange),
    expenseChange,
    expenseRealChange: realize(expenseChange),
    categories,
    inflation12m,
    purchasingPower:
      firstWithIncome && current.incomeCents > 0
        ? { fromMonth: firstWithIncome.month, change: current.realIncomeCents / firstWithIncome.realIncomeCents - 1 }
        : null,
    anyEstimated: rows.some((r) => r.ipcEstimated),
  };
}
