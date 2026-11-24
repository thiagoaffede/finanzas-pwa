import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { setBillPaid } from "@/lib/data/repository";
import { todayAR } from "@/lib/finance";

const patch = z.object({ paid: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await parseBody(req, patch);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  const row = await setBillPaid(db, (await params).id, body.data.paid, todayAR());
  return row ? json(row) : json({ error: "No existe" }, { status: 404 });
}
