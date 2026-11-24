import type { Cents, ISODate } from "@/types/finance";
import { monthsBetween, monthOf, addMonths } from "./dates";

/** Planificador de objetivos de ahorro. */

export interface GoalPlanInput {
  targetCents: Cents;
  savedCents: Cents;
  today: ISODate;
  /** Si se da fecha objetivo, calcula el aporte necesario. */
  targetDate?: ISODate;
  /** Si se da aporte mensual deseado, calcula cuándo se llega. */
  monthlyContributionCents?: Cents;
  /** Margen mensual libre (para saber qué % representa el aporte). */
  monthlyMarginCents?: Cents;
}

export interface GoalPlan {
  remainingCents: Cents;
  monthsLeft: number | null;
  monthlyNeededCents: Cents | null;
  weeklyNeededCents: Cents | null;
  /** Mes estimado en que se completa el objetivo. */
  reachMonth: string | null;
  pctOfMargin: number | null;
  progress: number;
  feasible: boolean | null;
}

export function planGoal(input: GoalPlanInput): GoalPlan {
  const remainingCents = Math.max(0, input.targetCents - input.savedCents);
  const progress = input.targetCents > 0 ? Math.min(1, input.savedCents / input.targetCents) : 1;
  const thisMonth = monthOf(input.today);

  let monthsLeft: number | null = null;
  let monthlyNeededCents: Cents | null = null;
  let reachMonth: string | null = null;

  if (remainingCents === 0) {
    return {
      remainingCents,
      monthsLeft: 0,
      monthlyNeededCents: 0,
      weeklyNeededCents: 0,
      reachMonth: thisMonth,
      pctOfMargin: 0,
      progress,
      feasible: true,
    };
  }

  if (input.targetDate) {
    // Se cuenta el mes actual como mes de aporte.
    monthsLeft = Math.max(1, monthsBetween(thisMonth, monthOf(input.targetDate)) + 1);
    monthlyNeededCents = Math.ceil(remainingCents / monthsLeft);
    reachMonth = monthOf(input.targetDate);
  } else if (input.monthlyContributionCents && input.monthlyContributionCents > 0) {
    monthsLeft = Math.ceil(remainingCents / input.monthlyContributionCents);
    monthlyNeededCents = input.monthlyContributionCents;
    reachMonth = addMonths(thisMonth, monthsLeft - 1);
  }

  const weeklyNeededCents =
    monthlyNeededCents === null ? null : Math.ceil((monthlyNeededCents * 12) / 52);
  const pctOfMargin =
    monthlyNeededCents !== null && input.monthlyMarginCents && input.monthlyMarginCents > 0
      ? monthlyNeededCents / input.monthlyMarginCents
      : null;
  const feasible = pctOfMargin === null ? null : pctOfMargin <= 1;

  return {
    remainingCents,
    monthsLeft,
    monthlyNeededCents,
    weeklyNeededCents,
    reachMonth,
    pctOfMargin,
    progress,
    feasible,
  };
}
