import type { ISODate } from "@/types/finance";
import { normalizeDate, normalizePeriod } from "./normalize";

/**
 * Lee valores de índices pegados como texto (por ejemplo copiados de una planilla del BCRA o INDEC).
 * Una línea por valor: "fecha;valor", "fecha<TAB>valor" o "fecha valor".
 * - ICL: fecha del día y valor del índice ("24/11/2026;27,1234").
 * - IPC: mes y variación mensual en % ("10/2026;2,7" = 2,7 %), se guarda como fracción.
 */
export function parseIndexText(text: string, indexType: "ICL" | "IPC"): { points: { date: ISODate; value: number }[]; errors: string[] } {
  const points: { date: ISODate; value: number }[] = [];
  const errors: string[] = [];
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || /^[a-záéíóú\s]+[;\t,]/i.test(line) && !/\d/.test(line.split(/[;\t]/)[0])) continue; // encabezado
    const parts = line.split(/\s*[;\t]\s*|\s{2,}|\s(?=[-\d.,]+%?$)/).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`Línea ${i + 1}: falta el valor`);
      continue;
    }
    const [d, v] = [parts[0], parts[parts.length - 1]];
    const date = indexType === "IPC" ? normalizePeriod(d) ?? normalizeDate(d)?.slice(0, 7) ?? null : normalizeDate(d);
    const num = parseLocaleNumber(v.replace("%", ""));
    if (!date || num === null) {
      errors.push(`Línea ${i + 1}: no se pudo leer "${line}"`);
      continue;
    }
    points.push({ date: indexType === "IPC" ? `${date}-01` : date, value: indexType === "IPC" ? Math.round(num * 1e6) / 1e8 : num });
  }
  return { points, errors };
}

function parseLocaleNumber(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  let n = t;
  if (t.includes(",") && t.includes(".")) n = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) n = t.replace(",", ".");
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}
