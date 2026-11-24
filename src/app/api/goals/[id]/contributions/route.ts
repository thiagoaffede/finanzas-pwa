import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { addGoalContribution } from "@/lib/data/repository";
import { todayAR } from "@/lib/finance";

const input = z.object({ amountCents: z.number().int(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await parseBody(req, input);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await addGoalContribution(db, (await params).id, body.data.date ?? todayAR(), body.data.amountCents), { status: 201 });
}
