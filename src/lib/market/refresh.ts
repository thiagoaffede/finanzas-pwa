import { after } from "next/server";
import { getDb } from "@/lib/db";
import type { AppSettings } from "@/lib/data/repository";
import type { ISODate } from "@/types/finance";
import { indicesSyncDue, syncOfficialIndices } from "./official-indices";
import { scalesSyncDue, syncFaecysScales } from "./faecys-sync";
import { moodleSyncDue, syncMoodleCalendar } from "@/lib/study/moodle-sync";

/**
 * Respaldo del cron diario: si los índices, las escalas o el calendario de Moodle quedaron viejos,
 * se actualizan después de mostrar la página (no la demoran).
 */
export function refreshStaleData(settings: AppSettings, today: ISODate) {
  const indices = indicesSyncDue(settings.indicesSync);
  const scales = scalesSyncDue(settings.scalesSync);
  const moodle = moodleSyncDue(settings.moodleIcalUrl, settings.moodleSync);
  if (!indices && !scales && !moodle) return;
  after(async () => {
    const db = getDb();
    if (indices) await syncOfficialIndices(db, { today }).catch(() => undefined);
    if (scales) await syncFaecysScales(db).catch(() => undefined);
    if (moodle) await syncMoodleCalendar(db, { today }).catch(() => undefined);
  });
}
