import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { deleteEvent, updateEvent } from "@/lib/data/study";
import { eventPatch } from "@/lib/study/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await parseBody(req, eventPatch);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  const row = await updateEvent(db, (await params).id, body.data);
  return row ? json(row) : json({ error: "Fecha no encontrada" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { db, res } = requireDb();
  if (!db) return res;
  return (await deleteEvent(db, (await params).id)) ? json({ ok: true }) : json({ error: "Fecha no encontrada" }, { status: 404 });
}
