import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { deleteTransfer, updateTransfer } from "@/lib/data/repository";
import { transferInput } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await parseBody(req, transferInput);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  const row = await updateTransfer(db, (await params).id, body.data);
  return row ? json(row) : json({ error: "No existe" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { db, res } = requireDb();
  if (!db) return res;
  const row = await deleteTransfer(db, (await params).id);
  return row ? json({ ok: true }) : json({ error: "No existe" }, { status: 404 });
}
