import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { listPayslips, upsertPayslip } from "@/lib/data/repository";

const cents = z.number().int();
const payslipInput = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  employer: z.string().nullish(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  remunerativeCents: cents.min(0),
  nonRemunerativeCents: cents.min(0).default(0),
  deductionsCents: cents.min(0),
  netCents: cents.positive(),
  lines: z.array(z.object({ code: z.string(), label: z.string(), type: z.enum(["rem", "nonrem", "deduction"]), amountCents: cents })).optional(),
  rawExtractedJson: z.unknown().optional(),
});

export async function GET() {
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await listPayslips(db));
}

/** Guarda un recibo confirmado (si ya había uno del mismo período, lo reemplaza). */
export async function POST(req: Request) {
  const body = await parseBody(req, payslipInput);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await upsertPayslip(db, body.data), { status: 201 });
}
