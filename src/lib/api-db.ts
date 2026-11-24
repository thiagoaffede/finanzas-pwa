import { getDb, hasDatabase } from "@/lib/db";
import { noDatabase } from "@/lib/api";
import type { Db } from "@/lib/data/db-type";

/** Devuelve la base o una respuesta 503 si no está configurada. */
export function requireDb(): { db: Db; res?: undefined } | { db?: undefined; res: Response } {
  if (!hasDatabase()) return { res: noDatabase() };
  return { db: getDb() };
}
