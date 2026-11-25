import type { Cents, ISODate } from "@/types/finance";
import { daysInMonth, monthOf, parseISODate } from "./dates";

/**
 * Presupuesto mensual por categoría.
 * Cuenta lo gastado en el mes en cada categoría (sin la parte que te deben devolver)
 * y lo compara con el tope. Avisa al llegar al 80 % y al pasarse.
 */

export const BUDGET_WARN = 0.8;

export interface BudgetRow {
  category: string;
  limitCents: Cents;
  spentCents: Cents;
  remainingCents: Cents;
  /** Gastado / tope (puede pasar de 1). */
  pct: number;
  /** A este ritmo, cuánto vas a gastar a fin de mes. */
  projectedCents: Cents;
  /** Cuánto podés gastar por día hasta fin de mes sin pasarte. */
  perDayCents: Cents;
  status: "ok" | "warn" | "over";
}

export function budgetStatus(spent: number, limit: number): BudgetRow["status"] {
  if (limit <= 0) return "ok";
  return spent > limit ? "over" : spent >= limit * BUDGET_WARN ? "warn" : "ok";
}

/** ¿Es una compra en cuotas? Esas no cuentan enteras: cuenta cada cuota en el mes en que vence. */
export const isMultiCuota = (t: { paymentMethod?: string; installments?: number }) => t.paymentMethod === "cuotas" && (t.installments ?? 1) > 1;

/**
 * Lo que entra al presupuesto del mes: los gastos del mes salvo las compras en cuotas,
 * más las cuotas que vencen este mes (de compras de este mes o de antes).
 */
export function budgetExpenses(
  expenses: { category: string; amountCents: Cents; owedCents?: Cents; paymentMethod?: string; installments?: number; isIncome?: boolean }[],
  monthCuotas: { category: string; amountCents: Cents; owedCents?: Cents }[],
) {
  return [
    ...expenses.filter((e) => !e.isIncome && !isMultiCuota(e)).map(({ category, amountCents, owedCents }) => ({ category, amountCents, owedCents })),
    ...monthCuotas,
  ];
}

export function computeBudgets(
  limits: Record<string, Cents>,
  expenses: { category: string; amountCents: Cents; owedCents?: Cents }[],
  today: ISODate,
): { rows: BudgetRow[]; unbudgeted: { category: string; spentCents: Cents }[]; totalLimitCents: Cents; totalSpentCents: Cents } {
  const spent = new Map<string, number>();
  for (const e of expenses) spent.set(e.category, (spent.get(e.category) ?? 0) + e.amountCents - (e.owedCents ?? 0));

  const month = monthOf(today);
  const totalDays = daysInMonth(month);
  const day = parseISODate(today).day;
  const daysLeft = totalDays - day + 1;

  const rows = Object.entries(limits)
    .filter(([, l]) => l > 0)
    .map(([category, limitCents]) => {
      const s = spent.get(category) ?? 0;
      const remainingCents = limitCents - s;
      return {
        category,
        limitCents,
        spentCents: s,
        remainingCents,
        pct: s / limitCents,
        projectedCents: Math.round((s / day) * totalDays),
        perDayCents: remainingCents > 0 ? Math.floor(remainingCents / daysLeft) : 0,
        status: budgetStatus(s, limitCents),
      };
    })
    .sort((a, b) => b.pct - a.pct);

  const unbudgeted = [...spent.entries()]
    .filter(([c, v]) => !(limits[c] > 0) && v > 0)
    .map(([category, spentCents]) => ({ category, spentCents }))
    .sort((a, b) => b.spentCents - a.spentCents);

  return {
    rows,
    unbudgeted,
    totalLimitCents: rows.reduce((s, r) => s + r.limitCents, 0),
    totalSpentCents: rows.reduce((s, r) => s + r.spentCents, 0),
  };
}

/**
 * Qué avisos de presupuesto mandar: categorías que cruzaron el 80 % o el 100 % y todavía
 * no se avisaron este mes. `sent` guarda "YYYY-MM:Categoría" → nivel ya avisado.
 */
export function pendingBudgetAlerts(rows: BudgetRow[], month: string, sent: Record<string, number>) {
  return rows.flatMap((r) => {
    const level = r.status === "over" ? 100 : r.status === "warn" ? 80 : 0;
    const key = `${month}:${r.category}`;
    return level && (sent[key] ?? 0) < level ? [{ key, level, row: r }] : [];
  });
}
