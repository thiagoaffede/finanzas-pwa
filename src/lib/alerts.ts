import type { DueItem } from "@/lib/finance/deadlines";
import { diffDays } from "@/lib/finance/dates";
import { formatARS } from "@/lib/finance/money";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Días antes del vencimiento en que avisamos (0 = el mismo día). Uno por día como máximo. */
export const ALERT_DAYS = [3, 1, 0];

/**
 * Arma el aviso diario de vencimientos. Avisa 3 días antes, el día anterior y el mismo día;
 * y una sola vez al día siguiente si una boleta quedó impaga. Devuelve null si no hay nada que avisar.
 */
export function buildDueAlert(items: DueItem[], today: string): PushPayload | null {
  const pending = items
    .filter((i) => !i.paid)
    .map((i) => ({ ...i, days: diffDays(today, i.dueDate) }))
    .filter((i) => ALERT_DAYS.includes(i.days) || (i.days === -1 && i.kind === "bill"))
    .sort((a, b) => a.days - b.days);
  if (pending.length === 0) return null;

  const when = (d: number) => (d === -1 ? "venció ayer" : d === 0 ? "vence hoy" : d === 1 ? "vence mañana" : `vence en ${d} días`);
  const lines = pending.map((i) => `${i.label}: ${formatARS(i.amountCents)} ${when(i.days)}`);
  const total = pending.reduce((s, i) => s + i.amountCents, 0);
  const urgent = pending.some((i) => i.days <= 0);

  return {
    title: pending.length === 1 ? `${pending[0].label} ${when(pending[0].days)}` : `${pending.length} vencimientos ${urgent ? "para hoy" : "cerca"} · ${formatARS(total)}`,
    body: lines.join("\n"),
    url: "/movimientos",
    tag: `vencimientos-${today}`,
  };
}
