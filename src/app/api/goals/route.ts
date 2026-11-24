import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { createGoal, listGoals } from "@/lib/data/repository";

const goalInput = z.object({
  name: z.string().min(1).max(80),
  targetCents: z.number().int().positive(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  monthlyContributionCents: z.number().int().min(0).nullish(),
});

export async function GET() {
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await listGoals(db));
}

export async function POST(req: Request) {
  const body = await parseBody(req, goalInput);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await createGoal(db, body.data), { status: 201 });
}
