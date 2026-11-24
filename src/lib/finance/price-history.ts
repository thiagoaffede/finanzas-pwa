import type { Cents, Rate, YearMonth } from "@/types/finance";
import { monthsBetween } from "./dates";

/** Historial de precios: ¿el ítem subió más o menos que la inflación de referencia? */

export interface PricePoint {
  month: YearMonth;
  priceCents: Cents;
}

export interface PriceVsInflation {
  from: PricePoint;
  to: PricePoint;
  priceChange: Rate;
  inflation: Rate;
  /** Positivo = subió más que la inflación (se encareció en términos reales). */
  realChange: Rate;
}

/**
 * @param monthlyInflation mapa mes → inflación mensual. Si falta un mes se usa `fallbackMonthly`.
 */
export function priceVsInflation(
  points: PricePoint[],
  monthlyInflation: Map<YearMonth, Rate>,
  fallbackMonthly = 0,
): PriceVsInflation | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.month.localeCompare(b.month));
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  let factor = 1;
  const n = monthsBetween(from.month, to.month);
  for (let i = 1; i <= n; i++) {
    const [y, m] = from.month.split("-").map(Number);
    const total = y * 12 + (m - 1) + i;
    const ym = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
    factor *= 1 + (monthlyInflation.get(ym) ?? fallbackMonthly);
  }
  const priceChange = to.priceCents / from.priceCents - 1;
  const inflation = factor - 1;
  return { from, to, priceChange, inflation, realChange: (1 + priceChange) / factor - 1 };
}
