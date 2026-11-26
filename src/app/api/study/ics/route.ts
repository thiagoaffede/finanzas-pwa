import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { importIcs } from "@/lib/study/moodle-sync";
import { todayAR } from "@/lib/finance";

/** Importa las fechas de un archivo .ics (el texto del archivo, hasta 1 MB). */
export async function POST(req: Request) {
  const body = await parseBody(req, z.object({ text: z.string().max(1_000_000) }));
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  const r = await importIcs(db, body.data.text, todayAR());
  return r.ok ? json(r, { status: 201 }) : json({ error: r.error }, { status: 422 });
}
