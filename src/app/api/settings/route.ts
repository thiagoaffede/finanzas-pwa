import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { getSettings, saveSettings } from "@/lib/data/repository";

const patch = z.object({
  monthlyInflation: z.number().min(-0.5).max(2).optional(),
  monthlyAlternativeRate: z.number().min(-0.5).max(2).optional(),
  bufferCents: z.number().int().min(0).optional(),
  netIncomeCents: z.number().int().min(0).nullable().optional(),
  openingBalanceCents: z.number().int().optional(),
  minBalanceCents: z.number().int().min(0).optional(),
  paydayBusinessDay: z.number().int().min(1).max(15).optional(),
});

export async function GET() {
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await getSettings(db));
}

export async function PUT(req: Request) {
  const body = await parseBody(req, patch);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await saveSettings(db, body.data));
}
