import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { deleteMistake, updateMistake } from "@/lib/data/study";
import { mistakePatch } from "@/lib/study/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await parseBody(req, mistakePatch);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  const row = await updateMistake(db, (await params).id, body.data);
  return row ? json(row) : json({ error: "Error no encontrado" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { db, res } = requireDb();
  if (!db) return res;
  return (await deleteMistake(db, (await params).id)) ? json({ ok: true }) : json({ error: "Error no encontrado" }, { status: 404 });
}
