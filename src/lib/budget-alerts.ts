import type { Db } from "@/lib/data/db-type";
import { getSettings, listTransactions, saveSettings } from "@/lib/data/repository";
import { computeBudgets, monthOf, pendingBudgetAlerts } from "@/lib/finance";
import { buildBudgetAlert } from "@/lib/alerts";
import { pushConfigured, sendToAll } from "@/lib/push";

/**
 * Revisa el presupuesto del mes y, si alguna categoría cruzó el 80 % o el 100 %,
 * manda un aviso (una vez por nivel y por mes). Se llama al cargar un gasto y en el cron diario.
 */
export async function checkBudgetAlerts(db: Db, today: string) {
  const settings = await getSettings(db);
  if (!Object.values(settings.budgets).some((v) => v > 0)) return { sent: 0 };
  const month = monthOf(today);
  const txs = await listTransactions(db, { month });
  const { rows } = computeBudgets(
    settings.budgets,
    txs.filter((t) => !t.isIncome).map((t) => ({ category: t.category ?? "Otros", amountCents: t.amountCents, owedCents: t.owedCents })),
    today,
  );
  const pending = pendingBudgetAlerts(rows, month, settings.budgetAlerts);
  if (pending.length === 0) return { sent: 0 };
  // Guarda primero (solo los avisos de este mes) para no repetir aunque falle el envío.
  const kept = Object.fromEntries(Object.entries(settings.budgetAlerts).filter(([k]) => k.startsWith(month)));
  await saveSettings(db, { budgetAlerts: { ...kept, ...Object.fromEntries(pending.map((p) => [p.key, p.level])) } });
  const alert = buildBudgetAlert(pending, month);
  if (!alert || !pushConfigured()) return { sent: 0, alert: alert?.title };
  const r = await sendToAll(db, alert);
  return { ...r, alert: alert.title };
}
