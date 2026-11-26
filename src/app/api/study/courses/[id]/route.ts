import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { deleteCourse, updateCourse } from "@/lib/data/study";
import { coursePatch } from "@/lib/study/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const body = await parseBody(req, coursePatch);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  const row = await updateCourse(db, (await params).id, body.data);
  return row ? json(row) : json({ error: "Curso no encontrado" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { db, res } = requireDb();
  if (!db) return res;
  return (await deleteCourse(db, (await params).id)) ? json({ ok: true }) : json({ error: "Curso no encontrado" }, { status: 404 });
}
