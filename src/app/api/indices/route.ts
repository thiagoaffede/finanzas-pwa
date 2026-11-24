import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { deleteIndexValue, getIndices, upsertIndexValues } from "@/lib/data/repository";
import { parseIndexText } from "@/lib/parsers/index-text";

const input = z.object({
  indexType: z.enum(["ICL", "IPC"]),
  /** Texto pegado: una línea por valor, "fecha;valor". */
  text: z.string().max(200_000).optional(),
  points: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/), value: z.number() })).optional(),
  source: z.string().max(200).optional(),
});

export async function GET() {
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await getIndices(db));
}

export async function POST(req: Request) {
  const body = await parseBody(req, input);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  const { indexType, text, points, source } = body.data;
  const parsed = text ? parseIndexText(text, indexType) : { points: [], errors: [] };
  const all = [...(points ?? []).map((p) => ({ date: p.date.length === 7 ? `${p.date}-01` : p.date, value: p.value })), ...parsed.points];
  if (all.length === 0) return json({ error: "No se encontraron valores", errors: parsed.errors }, { status: 422 });
  const saved = await upsertIndexValues(db, indexType, all, source);
  return json({ saved, errors: parsed.errors });
}

const del = z.object({ indexType: z.enum(["ICL", "IPC"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function DELETE(req: Request) {
  const body = await parseBody(req, del);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  await deleteIndexValue(db, body.data.indexType, body.data.date);
  return json({ ok: true });
}
