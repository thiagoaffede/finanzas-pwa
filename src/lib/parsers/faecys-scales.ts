import type { CommerceCategory, ScaleEntry } from "@/lib/finance/commerce-union";
import { lastDayOfMonth } from "@/lib/finance/dates";

/**
 * Lee la circular de escalas de FAECYS (CCT 130/75): una página por categoría con una fila por mes:
 *   "NOVIEMBRE / 2026 1.233.448 120.000 25.000 1.378.448"
 *   (básico · no remunerativo según acuerdos · suma no remunerativa · total)
 * Si la segunda suma es "por única vez", no lleva antigüedad ni presentismo y va aparte.
 * Solo toma las categorías de mayores (las que usa el estimador); menores y adicionales se saltean.
 */

const MONTHS: Record<string, string> = {
  ENERO: "01", FEBRERO: "02", MARZO: "03", ABRIL: "04", MAYO: "05", JUNIO: "06",
  JULIO: "07", AGOSTO: "08", SEPTIEMBRE: "09", SETIEMBRE: "09", OCTUBRE: "10", NOVIEMBRE: "11", DICIEMBRE: "12",
};

const GROUPS: [RegExp, string][] = [
  [/^MAESTRANZA$/, "MAESTRANZA"],
  [/^ADMINISTRATIVOS?$/, "ADMINISTRATIVO"],
  [/^CAJER[OA]S?$/, "CAJERO"],
  [/^AUXILIAR ESPECIALIZADO$/, "AUXILIAR_ESPECIALIZADO"],
  [/^AUXILIAR$/, "AUXILIAR"],
  [/^VENDEDOR(ES)?$/, "VENDEDOR"],
];

const VALID = new Set<string>([
  "MAESTRANZA_A", "MAESTRANZA_B", "MAESTRANZA_C",
  "ADMINISTRATIVO_A", "ADMINISTRATIVO_B", "ADMINISTRATIVO_C", "ADMINISTRATIVO_D", "ADMINISTRATIVO_E", "ADMINISTRATIVO_F",
  "CAJERO_A", "CAJERO_B", "CAJERO_C",
  "AUXILIAR_A", "AUXILIAR_B", "AUXILIAR_C",
  "AUXILIAR_ESPECIALIZADO_A", "AUXILIAR_ESPECIALIZADO_B",
  "VENDEDOR_A", "VENDEDOR_B", "VENDEDOR_C", "VENDEDOR_D",
]);

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** "1.233.448" o "287.967,32" → centavos. */
export function pesosToCents(s: string): number | null {
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.replace(/\./g, "").split(",");
  return Number(int) * 100 + Number(dec.padEnd(2, "0"));
}

export interface FaecysScalePage {
  category: CommerceCategory;
  rows: { month: string; basicCents: number; nonRemunerativeCents: number; oneTimeCents: number }[];
}

export interface FaecysCircular {
  /** "10/2026" */
  agreement: string | null;
  pages: FaecysScalePage[];
}

/** Una página de texto → categoría y filas (null si no es una escala de mayores). */
export function parseScalePage(text: string): FaecysScalePage | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const ai = lines.findIndex((l) => /^ACUERDO\b/i.test(strip(l)));
  if (ai < 0) return null;

  // Entre "ACUERDO: …" y la fila de encabezados están el grupo y la letra ("MAESTRANZA" / "A" o "B BÁSICO …").
  const head: string[] = [];
  for (const l of lines.slice(ai + 1, ai + 6)) {
    const u = strip(l);
    if (/^MES\b/.test(u)) break;
    const before = u.split(/\bBASICO\b/)[0].trim();
    if (before) head.push(before);
    if (/\bBASICO\b/.test(u)) break;
  }
  if (head.length !== 2) return null; // menores (3 renglones) y adicionales no van
  const group = GROUPS.find(([re]) => re.test(head[0]))?.[1];
  const letter = /^([A-F])$/.exec(head[1])?.[1];
  if (!group || !letter) return null;
  const category = `${group}_${letter}`;
  if (!VALID.has(category)) return null;

  const oneTimeColumn = /UNICA VEZ/.test(strip(text));
  const rows: FaecysScalePage["rows"] = [];
  for (const l of lines) {
    const m = /^([A-Z]+)\s*\/\s*(\d{4})\s+(.+)$/.exec(strip(l));
    if (!m || !MONTHS[m[1]]) continue;
    const nums = m[3].split(/\s+/).map(pesosToCents);
    if (nums.some((n) => n === null) || nums.length < 3) continue;
    const [basic, nr1, ...rest] = nums as number[];
    const total = rest.length ? rest[rest.length - 1] : null;
    const nr2 = rest.length >= 2 ? rest[0] : 0;
    // Control: básico + sumas = total (si no cierra, la fila se leyó mal).
    if (total !== null && basic + nr1 + nr2 !== total) continue;
    rows.push({
      month: `${m[2]}-${MONTHS[m[1]]}`,
      basicCents: basic,
      nonRemunerativeCents: nr1 + (oneTimeColumn ? 0 : nr2),
      oneTimeCents: oneTimeColumn ? nr2 : 0,
    });
  }
  if (!rows.length) return null;
  return { category: category as CommerceCategory, rows };
}

/** Todas las páginas de la circular. */
export function parseFaecysCircular(pages: string[]): FaecysCircular {
  const agreement = pages.map((p) => /ACUERDO:?\s*(\d{1,2}\/\d{4})/i.exec(p)?.[1]).find(Boolean) ?? null;
  const out: FaecysScalePage[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    const page = parseScalePage(p);
    if (page && !seen.has(page.category)) {
      seen.add(page.category);
      out.push(page);
    }
  }
  return { agreement, pages: out };
}

/**
 * Filas de la circular → escalas por mes. Cada mes vale del 1 al último día;
 * el último mes queda abierto ("en adelante") hasta que salga la próxima circular.
 */
export function circularToScales(c: FaecysCircular, source: string): ScaleEntry[] {
  const out: ScaleEntry[] = [];
  for (const page of c.pages) {
    const rows = [...page.rows].sort((a, b) => a.month.localeCompare(b.month));
    rows.forEach((r, i) =>
      out.push({
        category: page.category,
        validFrom: `${r.month}-01`,
        validTo: i === rows.length - 1 ? null : lastDayOfMonth(r.month),
        basicCents: r.basicCents,
        nonRemunerativeCents: r.nonRemunerativeCents,
        oneTimeNonRemunerativeCents: r.oneTimeCents,
        source,
      }),
    );
  }
  return out;
}
