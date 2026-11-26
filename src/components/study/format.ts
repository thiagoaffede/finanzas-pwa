import type { ISODate } from "@/types/finance";
import { diffDays } from "@/lib/finance/dates";

const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "2026-12-17" → "jue 17/12" */
export function shortDate(d: ISODate): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]} ${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** "hoy", "mañana", "en 5 días", "hace 2 días". */
export function relativeDays(today: ISODate, d: ISODate): string {
  const n = diffDays(today, d);
  if (n === 0) return "hoy";
  if (n === 1) return "mañana";
  if (n === -1) return "ayer";
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}

/** 95 → "1 h 35 min" */
export function minutesLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
