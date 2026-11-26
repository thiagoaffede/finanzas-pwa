import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { saveSettings } from "@/lib/data/repository";
import { syncMoodleCalendar } from "@/lib/study/moodle-sync";
import { validIcalUrl } from "@/lib/study/ical";
import { todayAR } from "@/lib/finance";

export const maxDuration = 30;

/** Guarda (o borra, con null) el link de exportación del calendario de Moodle y sincroniza. */
export async function PUT(req: Request) {
  const body = await parseBody(req, z.object({ url: z.string().max(1000).nullable() }));
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  if (body.data.url === null) {
    await saveSettings(db, { moodleIcalUrl: null, moodleSync: null });
    return json({ ok: true });
  }
  const url = validIcalUrl(body.data.url);
  if (!url) return json({ error: "Pegá el link que da Moodle en Calendario → Exportar calendario (termina en export_execute.php?…)." }, { status: 422 });
  await saveSettings(db, { moodleIcalUrl: url.toString() });
  return json(await syncMoodleCalendar(db, { today: todayAR() }));
}

/** Sincronizar ahora. */
export async function POST() {
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await syncMoodleCalendar(db, { today: todayAR() }));
}
