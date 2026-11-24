import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { updateGoal } from "@/lib/data/repository";

const patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  targetCents: z.number().int().positive().optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  monthlyContributionCents: z.number().int().min(0).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await parseBody(req, patch);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  const row = await updateGoal(db, (await params).id, body.data);
  return row ? json(row) : json({ error: "Objetivo no encontrado" }, { status: 404 });
}

/** Elimina el objetivo de la lista (queda archivado con sus aportes). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { db, res } = requireDb();
  if (!db) return res;
  const row = await updateGoal(db, (await params).id, { archived: true });
  return row ? json({ ok: true }) : json({ error: "Objetivo no encontrado" }, { status: 404 });
}
