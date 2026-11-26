import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { loadTemplate } from "@/lib/data/study";
import { STUDY_TEMPLATES } from "@/lib/study/templates";

/** Carga una plantilla de cursos (por ejemplo, los ATI de la UNS) con sus temas y fechas. */
export async function POST(req: Request) {
  const body = await parseBody(req, z.object({ id: z.string().max(60) }));
  if (!body.ok) return body.res;
  const template = STUDY_TEMPLATES.find((t) => t.id === body.data.id);
  if (!template) return json({ error: "Plantilla no encontrada" }, { status: 404 });
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await loadTemplate(db, template), { status: 201 });
}
