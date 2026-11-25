import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { setAccountBalance, updateAccount } from "@/lib/data/repository";

const patch = z.object({
  /** Saldo que ves hoy en la cuenta: lo fija y empieza a contar desde ahora. */
  balanceCents: z.number().int().optional(),
  name: z.string().trim().min(1).max(60).optional(),
  archived: z.boolean().optional(),
  /** Tarjetas: día de cierre y de vencimiento del resumen. */
  closingDay: z.number().int().min(1).max(31).nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await parseBody(req, patch);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  const { id } = await params;
  const { balanceCents, ...rest } = body.data;
  let row = null;
  if (balanceCents !== undefined) row = await setAccountBalance(db, id, balanceCents);
  if (Object.keys(rest).length) row = await updateAccount(db, id, rest);
  if (!row) return json({ error: "Cuenta no encontrada" }, { status: 404 });
  return json(row);
}
