import { json } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { parseBackup, restoreBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/backup/restore?confirmar=REEMPLAZAR
 * Sin `confirmar` solo revisa el archivo y devuelve cuántas filas trae (no toca nada).
 */
export async function POST(req: Request) {
  const { db, res } = requireDb();
  if (!db) return res;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "El archivo no es un JSON válido." }, { status: 400 });
  }
  const check = parseBackup(raw);
  if (!check.ok) return json({ error: check.error }, { status: 422 });
  const confirm = new URL(req.url).searchParams.get("confirmar") === "REEMPLAZAR";
  if (!confirm) return json({ ok: true, dryRun: true, exportedAt: check.backup.exportedAt, withFiles: check.backup.withFiles, counts: check.counts });
  try {
    const r = await restoreBackup(db, check.backup);
    return json({ ok: true, exportedAt: check.backup.exportedAt, counts: r.restored });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "No se pudo restaurar." }, { status: 500 });
  }
}
