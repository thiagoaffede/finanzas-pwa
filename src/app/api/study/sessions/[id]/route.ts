import { json } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { deleteSession } from "@/lib/data/study";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { db, res } = requireDb();
  if (!db) return res;
  return (await deleteSession(db, (await params).id)) ? json({ ok: true }) : json({ error: "Registro no encontrado" }, { status: 404 });
}
