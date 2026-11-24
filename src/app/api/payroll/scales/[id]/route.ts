import { json } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { deleteScale } from "@/lib/data/repository";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { db, res } = requireDb();
  if (!db) return res;
  await deleteScale(db, (await params).id);
  return json({ ok: true });
}
