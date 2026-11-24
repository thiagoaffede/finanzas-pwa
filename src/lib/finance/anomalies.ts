import type { Cents, Rate, YearMonth } from "@/types/finance";
import { monthsBetween, addMonths } from "./dates";

/**
 * Detección de boletas fuera de lo normal.
 *
 * Los montos históricos se llevan a pesos del período actual con la inflación mensual
 * de referencia (si no, en Argentina todo parecería "anómalo"). Se compara contra:
 *  - el promedio de los últimos `windowMonths` períodos (ajustados), y
 *  - el mismo mes del año anterior, si existe (estacionalidad: gas en invierno, luz en verano).
 */

export interface BillHistoryPoint {
  period: YearMonth;
  amountCents: Cents;
}

export interface AnomalyOptions {
  windowMonths?: number;
  /** Variación % sobre la base a partir de la cual se avisa. */
  pctThreshold?: Rate;
  /** Desvíos estándar a partir de los cuales se avisa. */
  zThreshold?: number;
  /** Inflación mensual para ajustar el histórico. */
  monthlyInflation?: Rate;
  /** Mínimo de puntos para opinar. */
  minHistory?: number;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  baselineCents: Cents | null;
  deviationPct: Rate | null;
  zScore: number | null;
  sameMonthLastYearCents: Cents | null;
  reason: string;
}

export function detectBillAnomaly(
  history: BillHistoryPoint[],
  current: BillHistoryPoint,
  opts: AnomalyOptions = {},
): AnomalyResult {
  const windowMonths = opts.windowMonths ?? 6;
  const pctThreshold = opts.pctThreshold ?? 0.3;
  const zThreshold = opts.zThreshold ?? 2;
  const infl = opts.monthlyInflation ?? 0;
  const minHistory = opts.minHistory ?? 3;

  const adjust = (p: BillHistoryPoint) =>
    p.amountCents * Math.pow(1 + infl, Math.max(0, monthsBetween(p.period, current.period)));

  const prior = history.filter((p) => p.period < current.period);
  const windowStart = addMonths(current.period, -windowMonths);
  const recent = prior.filter((p) => p.period >= windowStart).map(adjust);

  const lastYear = prior.find((p) => p.period === addMonths(current.period, -12));
  const sameMonthLastYearCents = lastYear ? Math.round(adjust(lastYear)) : null;

  if (recent.length < minHistory) {
    return {
      isAnomaly: false,
      baselineCents: recent.length ? Math.round(mean(recent)) : null,
      deviationPct: null,
      zScore: null,
      sameMonthLastYearCents,
      reason: "Historial insuficiente para comparar",
    };
  }

  const avg = mean(recent);
  const sd = stdDev(recent, avg);
  const deviationPct = (current.amountCents - avg) / avg;
  const zScore = sd > 0 ? (current.amountCents - avg) / sd : null;

  // Si el mismo mes del año pasado (ajustado) explica el salto, es estacional.
  const seasonal =
    sameMonthLastYearCents !== null && current.amountCents <= sameMonthLastYearCents * (1 + pctThreshold);

  const high = deviationPct > pctThreshold && (zScore === null || zScore > zThreshold);
  const isAnomaly = high && !seasonal;

  let reason = "Dentro de lo normal";
  if (isAnomaly)
    reason = `Viene ${(deviationPct * 100).toFixed(0)} % más alta que el promedio de los últimos ${recent.length} meses (ajustado por inflación)`;
  else if (high && seasonal) reason = "Más alta que el promedio, pero similar al mismo mes del año pasado (estacional)";

  return { isAnomaly, baselineCents: Math.round(avg), deviationPct, zScore, sameMonthLastYearCents, reason };
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function stdDev(xs: number[], m: number): number {
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}
