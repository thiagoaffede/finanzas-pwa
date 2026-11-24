import type { Cents, ISODate, YearMonth } from "@/types/finance";
import { addDays, addMonths, daysInMonth, diffDays, monthOf, parseISODate, toISODate } from "./dates";

/**
 * Calendario de cobro: día de pago, sueldo proporcional al ingresar y aguinaldo (SAC).
 *
 * - El sueldo de un mes se cobra el mes siguiente, el N.º día hábil (por defecto el 3.º).
 * - Si entraste a trabajar a mitad de mes, ese primer sueldo es proporcional:
 *   sueldo / 30 × días trabajados (mes comercial de 30 días).
 * - SAC: la mitad de la mejor remuneración mensual del semestre, proporcional a los días
 *   trabajados en el semestre. 1.ª cuota hasta el 30/6, 2.ª hasta el 18/12.
 *
 * Días hábiles: lunes a viernes sin feriados nacionales fijos, Carnaval ni Viernes Santo.
 * Los feriados trasladables (17/6, 17/8, 12/10, 20/11) cambian por decreto y no se consideran.
 */

const FIXED_HOLIDAYS = ["01-01", "03-24", "04-02", "05-01", "05-25", "06-20", "07-09", "12-08", "12-25"];

/** Domingo de Pascua (algoritmo de Meeus/Butcher). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toISODate(year, month, day);
}

export function isHoliday(date: ISODate): boolean {
  if (FIXED_HOLIDAYS.includes(date.slice(5))) return true;
  const easter = easterSunday(Number(date.slice(0, 4)));
  // Carnaval (lunes y martes) y Viernes Santo.
  return [-48, -47, -2].some((n) => addDays(easter, n) === date);
}

export function isBusinessDay(date: ISODate): boolean {
  const { y, m, day } = parseISODate(date);
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return dow !== 0 && dow !== 6 && !isHoliday(date);
}

/** N.º día hábil del mes (1 = primero). */
export function nthBusinessDay(month: YearMonth, n: number): ISODate {
  let date = `${month}-01`;
  let count = 0;
  for (;;) {
    if (isBusinessDay(date)) count++;
    if (count >= n) return date;
    date = addDays(date, 1);
  }
}

export interface PayrollCalendarInput {
  /** Sueldo neto de un mes completo. */
  monthlyNetCents: Cents;
  /** Fecha de ingreso (si no se sabe, se asume mes completo). */
  hireDate?: ISODate | null;
  /** Día hábil de cobro (3 = tercer día hábil). */
  paydayBusinessDay?: number;
}

/** Días trabajados en un mes según el mes comercial de 30 días. */
export function daysWorkedInMonth(month: YearMonth, hireDate?: ISODate | null): number {
  if (!hireDate || monthOf(hireDate) < month) return 30;
  if (monthOf(hireDate) > month) return 0;
  const d = Math.min(30, parseISODate(hireDate).day);
  return 30 - d + 1;
}

/** Cobro de sueldo que entra en `month` (corresponde al mes anterior). */
export function salaryPayment(month: YearMonth, input: PayrollCalendarInput): { date: ISODate; accrualMonth: YearMonth; amountCents: Cents; days: number } {
  const accrualMonth = addMonths(month, -1);
  const days = daysWorkedInMonth(accrualMonth, input.hireDate);
  return {
    date: nthBusinessDay(month, input.paydayBusinessDay ?? 3),
    accrualMonth,
    days,
    amountCents: Math.round((input.monthlyNetCents * days) / 30),
  };
}

/** Aguinaldo que se cobra en junio o diciembre (null en otros meses). */
export function sacPayment(month: YearMonth, input: PayrollCalendarInput): { date: ISODate; amountCents: Cents; daysWorked: number; semesterDays: number } | null {
  const [y, m] = month.split("-").map(Number);
  if (m !== 6 && m !== 12) return null;
  const start = toISODate(y, m === 6 ? 1 : 7, 1);
  const end = toISODate(y, m, daysInMonth(month));
  const semesterDays = diffDays(start, end) + 1;
  const from = input.hireDate && input.hireDate > start ? input.hireDate : start;
  const daysWorked = from > end ? 0 : diffDays(from, end) + 1;
  if (daysWorked === 0) return null;
  return {
    date: toISODate(y, m, m === 6 ? 30 : 18),
    daysWorked,
    semesterDays,
    amountCents: Math.round(((input.monthlyNetCents / 2) * daysWorked) / semesterDays),
  };
}
