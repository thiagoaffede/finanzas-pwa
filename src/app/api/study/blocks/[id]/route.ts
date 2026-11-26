import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { deleteBlock, updateBlock } from "@/lib/data/study";
import { blockPatch } from "@/lib/study/schemas";
import { todayAR } from "@/lib/finance";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await parseBody(req, blockPatch);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  const row = await updateBlock(db, (await params).id, body.data, todayAR());
  return row ? json(row) : json({ error: "Tema no encontrado" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { db, res } = requireDb();
  if (!db) return res;
  return (await deleteBlock(db, (await params).id)) ? json({ ok: true }) : json({ error: "Tema no encontrado" }, { status: 404 });
}
