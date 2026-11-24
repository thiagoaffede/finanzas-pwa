import type { Cents, IndexType, ISODate, Rate, YearMonth } from "@/types/finance";
import { addMonths, addMonthsToDate, monthOf } from "./dates";
import { mulCents } from "./money";

/**
 * Cálculo de aumento de alquiler.
 *
 * - ICL (BCRA, diario): coeficiente = ICL(fecha de ajuste) / ICL(fecha del ajuste anterior).
 *   Se usa el último valor publicado en o antes de cada fecha.
 * - IPC (INDEC, mensual): se componen las variaciones mensuales de los `intervalo` meses
 *   que terminan en el mes (ajuste − 1 − lagMonths). Con lag 1 (default), un ajuste de abril
 *   usa dic–ene–feb, porque el IPC de marzo todavía no se publicó.
 * - FIXED: porcentaje fijo pactado por cada ajuste.
 *
 * Si falta un dato del índice, se proyecta con `projectedMonthlyInflation` y el ajuste queda
 * marcado como `projected: true`.
 */

export interface RentContract {
  startDate: ISODate;
  baseRentCents: Cents;
  adjustmentIntervalMonths: number;
  indexType: IndexType;
  /** Solo FIXED: aumento por ajuste (0.1 = 10 %). */
  fixedRate?: Rate;
  /** Duración del contrato (para no proyectar ajustes después del fin). */
  durationMonths?: number;
  /** Solo IPC: meses de rezago (default 1). */
  lagMonths?: number;
}

export interface IndexData {
  /** ICL diario: fecha → valor. */
  icl?: { date: ISODate; value: number }[];
  /** IPC: mes → variación mensual (0.025 = 2,5 %). */
  ipc?: { month: YearMonth; rate: Rate }[];
}

export interface RentAdjustment {
  date: ISODate;
  fromCents: Cents;
  toCents: Cents;
  coefficient: number;
  increasePct: Rate;
  projected: boolean;
  /** Detalle de cómo se obtuvo el coeficiente. */
  detail: string;
}

export interface RentOptions {
  /** Inflación mensual para proyectar cuando falta el dato. */
  projectedMonthlyInflation?: Rate;
}

/** Fechas de ajuste a partir del inicio, hasta `until` inclusive (y hasta el fin del contrato). */
export function adjustmentDates(contract: RentContract, until: ISODate): ISODate[] {
  if (contract.adjustmentIntervalMonths <= 0) throw new Error("El intervalo de ajuste debe ser > 0");
  const dates: ISODate[] = [];
  for (let k = 1; ; k++) {
    const offset = k * contract.adjustmentIntervalMonths;
    if (contract.durationMonths !== undefined && offset >= contract.durationMonths) break;
    const d = addMonthsToDate(contract.startDate, offset);
    if (d > until) break;
    dates.push(d);
  }
  return dates;
}

function iclValueAt(series: { date: ISODate; value: number }[], date: ISODate): { date: ISODate; value: number } | null {
  let best: { date: ISODate; value: number } | null = null;
  for (const p of series) if (p.date <= date && (!best || p.date > best.date)) best = p;
  return best;
}

function iclCoefficient(
  series: { date: ISODate; value: number }[],
  from: ISODate,
  to: ISODate,
  projected: Rate,
): { coefficient: number; projected: boolean; detail: string } {
  const a = iclValueAt(series, from);
  const b = iclValueAt(series, to);
  if (!a) {
    const months = monthsDiff(from, to);
    return {
      coefficient: Math.pow(1 + projected, months),
      projected: true,
      detail: `Sin ICL al ${from}: proyectado ${months} meses`,
    };
  }
  if (!b || b.date < to) {
    // Hay dato inicial pero falta el final: se completa con proyección desde el último publicado.
    const last = b ?? a;
    const extraMonths = monthsDiff(last.date, to);
    const coefficient = (last.value / a.value) * Math.pow(1 + projected, extraMonths);
    const isProjected = extraMonths > 0 || !b;
    return {
      coefficient,
      projected: isProjected,
      detail: isProjected
        ? `ICL ${a.date}→${last.date} + proyección ${extraMonths} meses`
        : `ICL ${a.date} (${a.value}) → ${last.date} (${last.value})`,
    };
  }
  return { coefficient: b.value / a.value, projected: false, detail: `ICL ${a.date} (${a.value}) → ${b.date} (${b.value})` };
}

function monthsDiff(from: ISODate, to: ISODate): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

function ipcCoefficient(
  series: { month: YearMonth; rate: Rate }[],
  adjustmentDate: ISODate,
  interval: number,
  lag: number,
  projected: Rate,
): { coefficient: number; projected: boolean; detail: string } {
  const byMonth = new Map(series.map((p) => [p.month, p.rate]));
  // lag 0 = hasta el mes anterior al ajuste; lag 1 = hasta dos meses antes (último IPC publicado).
  const lastMonth = addMonths(monthOf(adjustmentDate), -1 - lag);
  let coefficient = 1;
  let missing = 0;
  const months: YearMonth[] = [];
  for (let i = interval - 1; i >= 0; i--) {
    const m = addMonths(lastMonth, -i);
    months.push(m);
    const rate = byMonth.get(m);
    if (rate === undefined) {
      missing++;
      coefficient *= 1 + projected;
    } else coefficient *= 1 + rate;
  }
  return {
    coefficient,
    projected: missing > 0,
    detail: `IPC ${months[0]} a ${months[months.length - 1]}${missing ? ` (${missing} meses proyectados)` : ""}`,
  };
}

/** Recorre todos los ajustes desde el inicio hasta `until`. */
export function rentAdjustments(
  contract: RentContract,
  indices: IndexData,
  until: ISODate,
  options: RentOptions = {},
): RentAdjustment[] {
  const projected = options.projectedMonthlyInflation ?? 0;
  const result: RentAdjustment[] = [];
  let current = contract.baseRentCents;
  let prevDate = contract.startDate;

  for (const date of adjustmentDates(contract, until)) {
    let c: { coefficient: number; projected: boolean; detail: string };
    switch (contract.indexType) {
      case "ICL":
        c = iclCoefficient(indices.icl ?? [], prevDate, date, projected);
        break;
      case "IPC":
        c = ipcCoefficient(
          indices.ipc ?? [],
          date,
          contract.adjustmentIntervalMonths,
          contract.lagMonths ?? 1,
          projected,
        );
        break;
      case "FIXED": {
        const rate = contract.fixedRate ?? 0;
        c = { coefficient: 1 + rate, projected: false, detail: `Fijo ${(rate * 100).toFixed(2)} %` };
        break;
      }
    }
    const to = mulCents(current, c.coefficient);
    result.push({
      date,
      fromCents: current,
      toCents: to,
      coefficient: c.coefficient,
      increasePct: c.coefficient - 1,
      projected: c.projected,
      detail: c.detail,
    });
    current = to;
    prevDate = date;
  }
  return result;
}

/** Alquiler vigente en una fecha. */
export function rentAt(contract: RentContract, indices: IndexData, date: ISODate, options: RentOptions = {}): Cents {
  const adj = rentAdjustments(contract, indices, date, options);
  return adj.length ? adj[adj.length - 1].toCents : contract.baseRentCents;
}

export interface NextAdjustment {
  date: ISODate;
  currentCents: Cents;
  newCents: Cents;
  increaseCents: Cents;
  increasePct: Rate;
  projected: boolean;
  detail: string;
}

/** Próximo ajuste a partir de `today` (proyectado si faltan índices). */
export function nextRentAdjustment(
  contract: RentContract,
  indices: IndexData,
  today: ISODate,
  options: RentOptions = {},
): NextAdjustment | null {
  const horizon = addMonthsToDate(today, contract.adjustmentIntervalMonths);
  const all = rentAdjustments(contract, indices, horizon, options);
  const next = all.find((a) => a.date > today);
  if (!next) return null;
  return {
    date: next.date,
    currentCents: next.fromCents,
    newCents: next.toCents,
    increaseCents: next.toCents - next.fromCents,
    increasePct: next.increasePct,
    projected: next.projected,
    detail: next.detail,
  };
}

/** Alquiler de cada mes en una ventana (para el cashflow). */
export function rentByMonth(
  contract: RentContract,
  indices: IndexData,
  months: YearMonth[],
  options: RentOptions = {},
): Map<YearMonth, Cents> {
  const out = new Map<YearMonth, Cents>();
  if (months.length === 0) return out;
  const last = months[months.length - 1];
  const adjustments = rentAdjustments(contract, indices, `${last}-31`, options);
  for (const m of months) {
    if (m < monthOf(contract.startDate)) continue;
    if (contract.durationMonths !== undefined && m >= addMonths(monthOf(contract.startDate), contract.durationMonths))
      continue;
    // Un ajuste aplica desde el mes en que cae.
    let rent = contract.baseRentCents;
    for (const a of adjustments) if (monthOf(a.date) <= m) rent = a.toCents;
    out.set(m, rent);
  }
  return out;
}
