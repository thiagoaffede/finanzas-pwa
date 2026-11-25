import { json } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { todayAR } from "@/lib/finance";
import { syncOfficialIndices } from "@/lib/market/official-indices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Actualizar ahora": trae IPC (INDEC) e ICL (BCRA) de las fuentes oficiales. */
export async function POST() {
  const { db, res } = requireDb();
  if (!db) return res;
  const result = await syncOfficialIndices(db, { today: todayAR() });
  if (!result.ipc.ok && !result.icl.ok) {
    return json({ error: `No se pudieron traer los índices. ${[result.ipc.error, result.icl.error].filter(Boolean).join(" · ")}`, result }, { status: 502 });
  }
  return json(result);
}
