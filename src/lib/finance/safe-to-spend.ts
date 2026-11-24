import type { Cents, ISODate } from "@/types/finance";
import { daysInMonth, diffDays, lastDayOfMonth, monthOf, parseISODate } from "./dates";

/**
 * Cuánto puedo gastar (safe-to-spend).
 *
 *   Disponible del mes = Ingreso neto − Vencimientos y cuotas del mes − Aporte a objetivos
 *   Restante           = Disponible del mes − Gastado en el mes
 *   Por día            = Restante / días que quedan (incluye hoy)
 */

export interface Obligation {
  label: string;
  amountCents: Cents;
  dueDate: ISODate;
  paid?: boolean;
}

export interface SafeToSpendInput {
  /** Fecha de cálculo; define el mes. */
  today: ISODate;
  /** Ingreso neto del mes (liquidado si lo hay, si no el estimado). */
  netIncomeCents: Cents;
  /** Vencimientos, cuotas y alquiler del mes (pagados o no). */
  obligations: Obligation[];
  /** Total a separar este mes para objetivos de ahorro. */
  goalContributionsCents: Cents;
  /** Gasto variable ya hecho en el mes (no incluye las obligaciones). */
  spentSoFarCents: Cents;
  /** Margen mínimo que no se considera disponible (colchón). */
  bufferCents?: Cents;
}

export type SafeToSpendStatus = "ok" | "tight" | "over";

export interface SafeToSpendResult {
  month: string;
  netIncomeCents: Cents;
  obligationsCents: Cents;
  pendingObligationsCents: Cents;
  goalContributionsCents: Cents;
  bufferCents: Cents;
  /** Lo que el mes permite gastar en variable. */
  availableMonthCents: Cents;
  /** Lo que queda después de lo ya gastado. */
  remainingCents: Cents;
  daysLeft: number;
  perDayCents: Cents;
  perWeekCents: Cents;
  /** Ritmo ideal: cuánto se "debería" haber gastado a esta altura del mes. */
  expectedSpentByTodayCents: Cents;
  status: SafeToSpendStatus;
}

export function calculateSafeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const month = monthOf(input.today);
  const inMonth = input.obligations.filter((o) => monthOf(o.dueDate) === month);
  const obligationsCents = inMonth.reduce((s, o) => s + o.amountCents, 0);
  const pendingObligationsCents = inMonth
    .filter((o) => !o.paid)
    .reduce((s, o) => s + o.amountCents, 0);
  const bufferCents = input.bufferCents ?? 0;

  const availableMonthCents =
    input.netIncomeCents - obligationsCents - input.goalContributionsCents - bufferCents;
  const remainingCents = availableMonthCents - input.spentSoFarCents;

  const daysLeft = diffDays(input.today, lastDayOfMonth(month)) + 1;
  const perDayCents = remainingCents > 0 ? Math.floor(remainingCents / daysLeft) : 0;
  const perWeekCents = remainingCents > 0 ? Math.min(remainingCents, perDayCents * 7) : 0;

  const totalDays = daysInMonth(month);
  const dayOfMonth = parseISODate(input.today).day;
  const expectedSpentByTodayCents =
    availableMonthCents > 0
      ? Math.round((availableMonthCents * (dayOfMonth - 1)) / totalDays)
      : 0;

  let status: SafeToSpendStatus = "ok";
  if (remainingCents < 0) status = "over";
  else if (input.spentSoFarCents > expectedSpentByTodayCents * 1.1 || remainingCents < availableMonthCents * 0.1)
    status = "tight";

  return {
    month,
    netIncomeCents: input.netIncomeCents,
    obligationsCents,
    pendingObligationsCents,
    goalContributionsCents: input.goalContributionsCents,
    bufferCents,
    availableMonthCents,
    remainingCents,
    daysLeft,
    perDayCents,
    perWeekCents,
    expectedSpentByTodayCents,
    status,
  };
}
