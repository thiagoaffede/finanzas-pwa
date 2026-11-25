import { requireDb } from "@/lib/api-db";
import { createBackup } from "@/lib/backup";
import { todayAR } from "@/lib/finance";
import { saveSettings } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

/** GET /api/backup[?archivos=1]: copia completa de todos los datos en JSON. */
export async function GET(req: Request) {
  const { db, res } = requireDb();
  if (!db) return res;
  const withFiles = new URL(req.url).searchParams.get("archivos") === "1";
  const now = new Date();
  await saveSettings(db, { lastBackupAt: now.toISOString() });
  const backup = await createBackup(db, { withFiles, now });
  return new Response(JSON.stringify(backup), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="finanzas-backup-${todayAR().replace(/-/g, "")}${withFiles ? "-con-archivos" : ""}.json"`,
      "cache-control": "no-store",
    },
  });
}
