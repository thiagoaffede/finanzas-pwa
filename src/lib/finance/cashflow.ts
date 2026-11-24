import type { Cents, CashflowKind, Direction, Rate, YearMonth } from "@/types/finance";
import { addMonths, monthRange } from "./dates";
import { mulCents, splitCents } from "./money";

/**
 * Flujo de caja proyectado (3–6 meses) y detección de cuellos de botella.
 *
 * Todo entra como `CashflowEntry` (un movimiento en un mes). Los helpers `recurring`
 * e `installmentPlan` expanden ingresos/gastos fijos y compras en cuotas a entradas mensuales.
 */

export interface CashflowEntry {
  month: YearMonth;
  kind: CashflowKind;
  direction: Direction;
  label: string;
  amountCents: Cents;
}

export interface RecurringSpec {
  kind: CashflowKind;
  direction: Direction;
  label: string;
  amountCents: Cents;
  fromMonth: YearMonth;
  /** Inclusive. Sin fin si se omite. */
  toMonth?: YearMonth;
  /** Crecimiento mensual compuesto (ej. inflación para gastos indexados). */
  monthlyGrowth?: Rate;
  /** Si es true, el simulador le aplica la inflación del escenario. */
  indexed?: boolean;
}

export function recurring(spec: RecurringSpec, window: YearMonth[]): CashflowEntry[] {
  const out: CashflowEntry[] = [];
  for (const month of window) {
    if (month < spec.fromMonth) continue;
    if (spec.toMonth && month > spec.toMonth) continue;
    const elapsed = monthIndex(spec.fromMonth, month);
    const amount = spec.monthlyGrowth
      ? mulCents(spec.amountCents, Math.pow(1 + spec.monthlyGrowth, elapsed))
      : spec.amountCents;
    out.push({ month, kind: spec.kind, direction: spec.direction, label: spec.label, amountCents: amount });
  }
  return out;
}

function monthIndex(from: YearMonth, to: YearMonth): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export interface InstallmentPlanSpec {
  label: string;
  /** Mes de la primera cuota. */
  firstMonth: YearMonth;
  count: number;
  /** Monto de cada cuota, o bien `totalCents` para repartir. */
  installmentCents?: Cents;
  totalCents?: Cents;
}

/** Genera las cuotas futuras de una compra (todas, no solo las de la ventana). */
export function installmentPlan(spec: InstallmentPlanSpec): CashflowEntry[] {
  const amounts =
    spec.installmentCents !== undefined
      ? Array.from({ length: spec.count }, () => spec.installmentCents!)
      : splitCents(spec.totalCents ?? 0, spec.count);
  return amounts.map((amountCents, i) => ({
    month: addMonths(spec.firstMonth, i),
    kind: "installment" as const,
    direction: "out" as const,
    label: `${spec.label} (${i + 1}/${spec.count})`,
    amountCents,
  }));
}

export interface CashflowInput {
  startMonth: YearMonth;
  months: number;
  openingBalanceCents: Cents;
  recurring: RecurringSpec[];
  installmentPlans: InstallmentPlanSpec[];
  /** Movimientos puntuales (ej. aguinaldo, un vencimiento anual, el alquiler ajustado mes a mes). */
  oneOff: CashflowEntry[];
  /** Saldo mínimo deseado; por debajo hay "cuello de botella". */
  minBalanceCents?: Cents;
}

export interface CashflowMonth {
  month: YearMonth;
  incomeCents: Cents;
  outflowCents: Cents;
  byKind: Partial<Record<CashflowKind, Cents>>;
  netCents: Cents;
  openingCents: Cents;
  closingCents: Cents;
  bottleneck: boolean;
  reasons: string[];
}

export interface CashflowProjection {
  months: CashflowMonth[];
  bottlenecks: YearMonth[];
  minClosingCents: Cents;
  minClosingMonth: YearMonth;
}

export function projectCashflow(input: CashflowInput): CashflowProjection {
  const window = monthRange(input.startMonth, input.months);
  const inWindow = new Set(window);
  const entries: CashflowEntry[] = [
    ...input.recurring.flatMap((r) => recurring(r, window)),
    ...input.installmentPlans.flatMap(installmentPlan).filter((e) => inWindow.has(e.month)),
    ...input.oneOff.filter((e) => inWindow.has(e.month)),
  ];
  const minBalance = input.minBalanceCents ?? 0;

  let balance = input.openingBalanceCents;
  const months: CashflowMonth[] = window.map((month, i) => {
    const list = entries.filter((e) => e.month === month);
    const byKind: Partial<Record<CashflowKind, Cents>> = {};
    let incomeCents = 0;
    let outflowCents = 0;
    for (const e of list) {
      if (e.direction === "in") incomeCents += e.amountCents;
      else {
        outflowCents += e.amountCents;
        byKind[e.kind] = (byKind[e.kind] ?? 0) + e.amountCents;
      }
    }
    const openingCents = balance;
    const netCents = incomeCents - outflowCents;
    balance += netCents;

    const reasons: string[] = [];
    if (balance < minBalance) reasons.push("El saldo queda por debajo del mínimo");
    if (netCents < 0) reasons.push("Salen más pesos de los que entran");
    if (i > 0) {
      const prev = entries.filter((e) => e.month === window[i - 1] && e.direction === "out");
      const prevRent = prev.filter((e) => e.kind === "rent").reduce((s, e) => s + e.amountCents, 0);
      if ((byKind.rent ?? 0) > prevRent && prevRent > 0) reasons.push("Entra el aumento del alquiler");
      const prevInst = prev.filter((e) => e.kind === "installment").reduce((s, e) => s + e.amountCents, 0);
      if ((byKind.installment ?? 0) > prevInst * 1.2 && (byKind.installment ?? 0) > 0)
        reasons.push("Se acumulan cuotas");
    }
    const bottleneck = balance < minBalance || netCents < 0;

    return { month, incomeCents, outflowCents, byKind, netCents, openingCents, closingCents: balance, bottleneck, reasons: bottleneck ? reasons : [] };
  });

  const min = months.reduce((a, b) => (b.closingCents < a.closingCents ? b : a), months[0]);
  return {
    months,
    bottlenecks: months.filter((m) => m.bottleneck).map((m) => m.month),
    minClosingCents: min?.closingCents ?? input.openingBalanceCents,
    minClosingMonth: min?.month ?? input.startMonth,
  };
}
