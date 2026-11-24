import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { listScales, upsertScale } from "@/lib/data/repository";
import type { CommerceCategory } from "@/lib/finance";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const scaleInput = z.object({
  category: z.string().regex(/^[A-Z_]+$/),
  validFrom: isoDate,
  validTo: isoDate.nullable().default(null),
  basicCents: z.number().int().positive(),
  nonRemunerativeCents: z.number().int().min(0).default(0),
  source: z.string().max(200).optional(),
});

export async function GET() {
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await listScales(db));
}

export async function POST(req: Request) {
  const body = await parseBody(req, scaleInput);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await upsertScale(db, { ...body.data, category: body.data.category as CommerceCategory }), { status: 201 });
}
