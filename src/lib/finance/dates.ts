import type { ISODate, YearMonth } from "@/types/finance";

/** Utilidades de fechas sin zona horaria (todo en UTC, a nivel día). */

const DAY_MS = 86_400_000;

export function parseISODate(d: ISODate): { y: number; m: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!match) throw new Error(`Fecha inválida: ${d}`);
  return { y: Number(match[1]), m: Number(match[2]), day: Number(match[3]) };
}

export function parseYearMonth(ym: YearMonth): { y: number; m: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) throw new Error(`Mes inválido: ${ym}`);
  return { y: Number(match[1]), m: Number(match[2]) };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toYearMonth(y: number, m: number): YearMonth {
  return `${y}-${pad(m)}`;
}

export function toISODate(y: number, m: number, day: number): ISODate {
  return `${y}-${pad(m)}-${pad(day)}`;
}

export function monthOf(d: ISODate): YearMonth {
  return d.slice(0, 7);
}

export function daysInMonth(ym: YearMonth): number {
  const { y, m } = parseYearMonth(ym);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const { y, m } = parseYearMonth(ym);
  const total = y * 12 + (m - 1) + n;
  return toYearMonth(Math.floor(total / 12), (total % 12) + 1);
}

/** Suma meses a una fecha, recortando al último día del mes si hace falta (31/01 + 1 = 28/02). */
export function addMonthsToDate(d: ISODate, n: number): ISODate {
  const { day } = parseISODate(d);
  const ym = addMonths(monthOf(d), n);
  const { y, m } = parseYearMonth(ym);
  return toISODate(y, m, Math.min(day, daysInMonth(ym)));
}

export function monthsBetween(from: YearMonth, to: YearMonth): number {
  const a = parseYearMonth(from);
  const b = parseYearMonth(to);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

function toUTC(d: ISODate): number {
  const { y, m, day } = parseISODate(d);
  return Date.UTC(y, m - 1, day);
}

/** Días de `from` a `to` (positivo si `to` es posterior). */
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

export function addDays(d: ISODate, n: number): ISODate {
  const t = new Date(toUTC(d) + n * DAY_MS);
  return toISODate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function lastDayOfMonth(ym: YearMonth): ISODate {
  const { y, m } = parseYearMonth(ym);
  return toISODate(y, m, daysInMonth(ym));
}

/** Lista de meses consecutivos empezando en `start`. */
export function monthRange(start: YearMonth, count: number): YearMonth[] {
  return Array.from({ length: count }, (_, i) => addMonths(start, i));
}

/** Fecha de hoy en Argentina (UTC-3) como ISODate. */
export function todayAR(now: Date = new Date()): ISODate {
  const t = new Date(now.getTime() - 3 * 3_600_000);
  return toISODate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
