import { after } from "next/server";
import { getDb } from "@/lib/db";
import type { AppSettings } from "@/lib/data/repository";
import type { ISODate } from "@/types/finance";
import { indicesSyncDue, syncOfficialIndices } from "./official-indices";
import { scalesSyncDue, syncFaecysScales } from "./faecys-sync";

/**
 * Respaldo del cron diario: si los índices o las escalas quedaron viejos,
 * se actualizan después de mostrar la página (no la demoran).
 */
export function refreshStaleData(settings: AppSettings, today: ISODate) {
  const indices = indicesSyncDue(settings.indicesSync);
  const scales = scalesSyncDue(settings.scalesSync);
  if (!indices && !scales) return;
  after(async () => {
    const db = getDb();
    if (indices) await syncOfficialIndices(db, { today }).catch(() => undefined);
    if (scales) await syncFaecysScales(db).catch(() => undefined);
  });
}
