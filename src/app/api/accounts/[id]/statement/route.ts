import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { payCardStatement } from "@/lib/data/repository";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const input = z.object({
  /** Vencimiento del resumen que se paga. */
  dueDate: isoDate,
  fromAccountId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  /** Día en que se pagó. */
  date: isoDate,
});

/** POST /api/accounts/:id/statement — paga el resumen de la tarjeta :id. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await parseBody(req, input);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  const { id } = await params;
  const r = await payCardStatement(db, { cardAccountId: id, ...body.data });
  if (!r.ok) return json({ error: r.error }, { status: 422 });
  return json(r, { status: 201 });
}
