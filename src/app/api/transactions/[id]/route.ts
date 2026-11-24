import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { setReimbursed } from "@/lib/data/repository";

const patch = z.object({ reimbursedCents: z.number().int().min(0) });

/** Marca cuánto te devolvieron de un gasto compartido. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await parseBody(req, patch);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  const row = await setReimbursed(db, (await params).id, body.data.reimbursedCents);
  return row ? json(row) : json({ error: "No existe" }, { status: 404 });
}
