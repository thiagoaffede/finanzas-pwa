import { json } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { syncFaecysScales } from "@/lib/market/faecys-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Actualizar ahora": vuelve a leer la última circular de escalas de FAECYS. */
export async function POST() {
  const { db, res } = requireDb();
  if (!db) return res;
  const result = await syncFaecysScales(db, { force: true });
  if (!result.ok) return json({ error: `No se pudieron traer las escalas: ${result.error}`, result }, { status: 502 });
  return json(result);
}
