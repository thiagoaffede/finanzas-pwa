import type { ISODate, YearMonth } from "@/types/finance";

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5,
  jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9, set: 9, setiembre: 9,
  oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");

/** "24/11/2026", "24-11-26", "2026-11-24" → "2026-11-24". */
export function normalizeDate(input: string | null | undefined): ISODate | null {
  if (!input) return null;
  const s = input.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const mo = Number(m[2]);
    const d = Number(m[1]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  return null;
}

/** "11/2026", "Noviembre 2026", "nov-26", "2026-11" → "2026-11". */
export function normalizePeriod(input: string | null | undefined): YearMonth | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2])}`;
  m = /^(\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return Number(m[1]) >= 1 && Number(m[1]) <= 12 ? `${y}-${pad(+m[1])}` : null;
  }
  m = /^([a-záéíóú]+)[\s/.-]*(?:de\s+)?(\d{2,4})$/.exec(s);
  if (m && MONTHS[m[1]]) {
    const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return `${y}-${pad(MONTHS[m[1]])}`;
  }
  return null;
}
