export const PROVIDER_NAME: Record<string, string> = {
  EDES: "EDES (luz)",
  CAMUZZI: "Camuzzi (gas)",
  BVC: "BVC (agua)",
  PERSONAL: "Personal",
  OTRO: "Otro",
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-11" → "nov 2026" */
export function monthLabel(ym: string): string {
  return `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}

/** "2026-11-24" → "24/11/2026" */
export function dateLabel(d: string): string {
  return d.split("-").reverse().join("/");
}

export const COMMERCE_CATEGORIES = [
  "MAESTRANZA_A", "MAESTRANZA_B", "MAESTRANZA_C",
  "ADMINISTRATIVO_A", "ADMINISTRATIVO_B", "ADMINISTRATIVO_C", "ADMINISTRATIVO_D", "ADMINISTRATIVO_E", "ADMINISTRATIVO_F",
  "CAJERO_A", "CAJERO_B", "CAJERO_C",
  "AUXILIAR_A", "AUXILIAR_B", "AUXILIAR_C", "AUXILIAR_ESPECIALIZADO_A", "AUXILIAR_ESPECIALIZADO_B",
  "VENDEDOR_A", "VENDEDOR_B", "VENDEDOR_C", "VENDEDOR_D",
] as const;

/** "AUXILIAR_ESPECIALIZADO_A" → "Auxiliar especializado A" */
export function categoryLabel(c: string): string {
  return c
    .split("_")
    .map((w, i) => (w.length === 1 ? w : i === 0 ? w[0] + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(" ");
}
