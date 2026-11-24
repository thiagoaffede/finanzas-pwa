import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { deleteTransaction, updateTransaction } from "@/lib/data/repository";
import { transactionPatch } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Edita un movimiento (monto, fecha, detalle, categoría, cuenta o lo que te devolvieron). */
export async function PATCH(req: Request, { params }: Ctx) {
  const body = await parseBody(req, transactionPatch);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  const row = await updateTransaction(db, (await params).id, body.data);
  return row ? json(row) : json({ error: "No existe" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { db, res } = requireDb();
  if (!db) return res;
  const row = await deleteTransaction(db, (await params).id);
  return row ? json({ ok: true }) : json({ error: "No existe" }, { status: 404 });
}
