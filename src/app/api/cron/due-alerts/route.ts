import { json } from "@/lib/api";
import { getDb, hasDatabase } from "@/lib/db";
import { loadFromDb } from "@/lib/data/context";
import { dueItems } from "@/lib/dashboard";
import { buildDueAlert } from "@/lib/alerts";
import { checkBudgetAlerts } from "@/lib/budget-alerts";
import { pushConfigured, sendToAll } from "@/lib/push";
import { todayAR } from "@/lib/finance";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * Aviso diario de vencimientos. Lo llama el cron de Vercel (vercel.json) con
 * `Authorization: Bearer $CRON_SECRET`; no usa la sesión del login.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return json({ error: "No autorizado" }, { status: 401 });
  }
  if (!hasDatabase() || !pushConfigured()) return json({ skipped: "sin base o sin claves VAPID" });

  const db = getDb();
  const ctx = await loadFromDb(db, todayAR());
  const budget = await checkBudgetAlerts(db, ctx.today).catch((e) => ({ error: String(e) }));
  const alert = buildDueAlert(dueItems(ctx), ctx.today, ctx.settings.reminderDays);
  if (!alert) return json({ sent: 0, reason: "nada que avisar", budget });
  return json({ alert: alert.title, ...(await sendToAll(db, alert)), budget });
}
