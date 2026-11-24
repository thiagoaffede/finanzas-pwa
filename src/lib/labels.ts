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
