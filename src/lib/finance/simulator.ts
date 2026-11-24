import type { Cents, Rate, YearMonth } from "@/types/finance";
import { projectCashflow, type CashflowInput, type CashflowProjection } from "./cashflow";
import { mulCents } from "./money";

/**
 * Simulador "¿Qué pasa si…?". Aplica operaciones a una COPIA del escenario base
 * y compara proyecciones. Nunca muta el input.
 */

export type ScenarioOp =
  | {
      type: "addPurchase";
      label: string;
      firstMonth: YearMonth;
      count: number;
      totalCents: Cents;
    }
  | { type: "addOneOff"; label: string; month: YearMonth; amountCents: Cents; direction: "in" | "out" }
  | { type: "setGoalContribution"; label: string; amountCents: Cents }
  | { type: "setInflation"; monthlyRate: Rate }
  | { type: "scaleIncome"; factor: number };

export interface SimulationResult {
  base: CashflowProjection;
  scenario: CashflowProjection;
  deltas: { month: YearMonth; closingDeltaCents: Cents; netDeltaCents: Cents }[];
  minBalanceDeltaCents: Cents;
  newBottlenecks: YearMonth[];
}

export function applyScenario(base: CashflowInput, ops: ScenarioOp[]): CashflowInput {
  // Copia profunda: el escenario base no se toca.
  const s: CashflowInput = structuredClone(base);
  for (const op of ops) {
    switch (op.type) {
      case "addPurchase":
        s.installmentPlans.push({ label: op.label, firstMonth: op.firstMonth, count: op.count, totalCents: op.totalCents });
        break;
      case "addOneOff":
        s.oneOff.push({ month: op.month, kind: "other", direction: op.direction, label: op.label, amountCents: op.amountCents });
        break;
      case "setGoalContribution": {
        const goal = s.recurring.find((r) => r.kind === "goal" && r.label === op.label);
        if (goal) goal.amountCents = op.amountCents;
        else
          s.recurring.push({ kind: "goal", direction: "out", label: op.label, amountCents: op.amountCents, fromMonth: s.startMonth });
        break;
      }
      case "setInflation":
        for (const r of s.recurring) if (r.indexed) r.monthlyGrowth = op.monthlyRate;
        break;
      case "scaleIncome":
        for (const r of s.recurring) if (r.direction === "in") r.amountCents = mulCents(r.amountCents, op.factor);
        break;
    }
  }
  return s;
}

export function simulate(base: CashflowInput, ops: ScenarioOp[]): SimulationResult {
  const baseProj = projectCashflow(base);
  const scenarioProj = projectCashflow(applyScenario(base, ops));
  const baseBottlenecks = new Set(baseProj.bottlenecks);
  return {
    base: baseProj,
    scenario: scenarioProj,
    deltas: scenarioProj.months.map((m, i) => ({
      month: m.month,
      closingDeltaCents: m.closingCents - baseProj.months[i].closingCents,
      netDeltaCents: m.netCents - baseProj.months[i].netCents,
    })),
    minBalanceDeltaCents: scenarioProj.minClosingCents - baseProj.minClosingCents,
    newBottlenecks: scenarioProj.bottlenecks.filter((m) => !baseBottlenecks.has(m)),
  };
}
