import type { DueItem } from "@/lib/finance/deadlines";
import { diffDays } from "@/lib/finance/dates";
import { formatARS } from "@/lib/finance/money";
import type { BudgetRow } from "@/lib/finance/budget";

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
export function buildDueAlert(items: DueItem[], today: string, days: number[] = ALERT_DAYS): PushPayload | null {
  const pending = items
    .filter((i) => !i.paid)
    .map((i) => ({ ...i, days: diffDays(today, i.dueDate) }))
    .filter((i) => days.includes(i.days) || (i.days === -1 && i.kind === "bill"))
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

/** Aviso de presupuesto: categorías que llegaron al 80 % o se pasaron del tope. */
export function buildBudgetAlert(items: { level: number; row: BudgetRow }[], month: string): PushPayload | null {
  if (items.length === 0) return null;
  const line = (i: { level: number; row: BudgetRow }) =>
    i.level >= 100
      ? `${i.row.category}: te pasaste ${formatARS(-i.row.remainingCents)} (gastaste ${formatARS(i.row.spentCents)} de ${formatARS(i.row.limitCents)})`
      : `${i.row.category}: usaste el ${Math.round(i.row.pct * 100)} %, te quedan ${formatARS(i.row.remainingCents)}`;
  const over = items.filter((i) => i.level >= 100);
  return {
    title:
      items.length === 1
        ? over.length
          ? `Te pasaste del presupuesto de ${items[0].row.category}`
          : `${items[0].row.category}: llegaste al ${Math.round(items[0].row.pct * 100)} % del presupuesto`
        : `Presupuesto: ${items.length} categorías cerca del tope`,
    body: items.map(line).join("\n"),
    url: "/presupuesto",
    tag: `presupuesto-${month}`,
  };
}
