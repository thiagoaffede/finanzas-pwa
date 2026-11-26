import { json } from "@/lib/api";
import { getDb, hasDatabase } from "@/lib/db";
import { loadFromDb } from "@/lib/data/context";
import { dueItems, paydayAlert } from "@/lib/dashboard";
import { buildDueAlert } from "@/lib/alerts";
import { checkBudgetAlerts } from "@/lib/budget-alerts";
import { pushConfigured, sendToAll } from "@/lib/push";
import { todayAR } from "@/lib/finance";
import { syncOfficialIndices } from "@/lib/market/official-indices";
import { syncFaecysScales } from "@/lib/market/faecys-sync";
import { timingSafeEqual } from "node:crypto";
import { getSettings } from "@/lib/data/repository";
import { listCourses, listEvents } from "@/lib/data/study";
import { syncMoodleCalendar } from "@/lib/study/moodle-sync";
import { buildStudyAlert } from "@/lib/study/alerts";
import { addDays } from "@/lib/finance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tarea diaria: actualiza los índices oficiales (IPC e ICL), las escalas de Comercio (FAECYS) y el calendario de Moodle,
 * y avisa los vencimientos y las fechas de estudio. Lo llama el cron de Vercel (vercel.json) con
 * `Authorization: Bearer $CRON_SECRET`; no usa la sesión del login.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return json({ error: "No autorizado" }, { status: 401 });
  }
  if (!hasDatabase()) return json({ skipped: "sin base" });

  const db = getDb();
  const today = todayAR();
  const indices = await syncOfficialIndices(db, { today })
    .then((r) => ({ ipc: r.ipc.ok ? r.ipc.saved : r.ipc.error, icl: r.icl.ok ? r.icl.saved : r.icl.error }))
    .catch((e) => ({ error: String(e) }));
  const scales = await syncFaecysScales(db)
    .then((r) => (r.ok ? (r.unchanged ? "sin cambios" : `${r.saved} escalas (${r.agreement ?? r.title})`) : r.error))
    .catch((e) => String(e));
  const moodle = (await getSettings(db)).moodleIcalUrl
    ? await syncMoodleCalendar(db, { today })
        .then((r) => (r.ok ? `${r.events} fechas` : r.error))
        .catch((e) => String(e))
    : "sin link";
  if (!pushConfigured()) return json({ indices, scales, moodle, skipped: "sin claves VAPID" });

  const studyAlert = await Promise.all([listCourses(db), listEvents(db, { from: addDays(today, -1) })])
    .then(([courses, events]) => buildStudyAlert(courses, events, today))
    .catch(() => null);
  const study = studyAlert ? { alert: studyAlert.title, ...(await sendToAll(db, studyAlert)) } : "nada que avisar";

  const ctx = await loadFromDb(db, today);
  const budget = await checkBudgetAlerts(db, ctx.today).catch((e) => ({ error: String(e) }));
  const payAlert = paydayAlert(ctx);
  const payday = payAlert ? { alert: payAlert.title, ...(await sendToAll(db, payAlert)) } : "no es día de cobro";
  const alert = buildDueAlert(dueItems(ctx), ctx.today, ctx.settings.reminderDays);
  if (!alert) return json({ sent: 0, reason: "nada que avisar", budget, payday, indices, scales, moodle, study });
  return json({ alert: alert.title, ...(await sendToAll(db, alert)), budget, payday, indices, scales, moodle, study });
}
