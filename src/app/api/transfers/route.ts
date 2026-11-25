import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { createTransfer } from "@/lib/data/repository";
import { transferInput } from "@/lib/schemas";

/** Pasa plata de una cuenta propia a otra. No cuenta como gasto ni ingreso. */
export async function POST(req: Request) {
  const body = await parseBody(req, transferInput);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await createTransfer(db, body.data), { status: 201 });
}
