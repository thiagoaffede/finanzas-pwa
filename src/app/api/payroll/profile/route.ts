import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { getPayrollProfile, savePayrollProfile } from "@/lib/data/repository";
import type { CommerceCategory } from "@/lib/finance";

const profileInput = z.object({
  category: z.string().regex(/^[A-Z_]+$/),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weeklyHours: z.number().int().min(1).max(48),
  configOverrides: z.record(z.string(), z.unknown()).nullable().default(null),
});

export async function GET() {
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await getPayrollProfile(db));
}

export async function PUT(req: Request) {
  const body = await parseBody(req, profileInput);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await savePayrollProfile(db, { ...body.data, category: body.data.category as CommerceCategory, configOverrides: body.data.configOverrides }));
}
