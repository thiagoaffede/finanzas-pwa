import { json, noDatabase, parseBody } from "@/lib/api";
import { getDb, hasDatabase } from "@/lib/db";
import { billInput } from "@/lib/schemas";
import { createBill, listBills } from "@/lib/data/repository";
import { classifyDue, todayAR } from "@/lib/finance";
import { demoBills } from "@/lib/demo-data";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Boletas con su estado de semáforo calculado. */
export async function GET() {
  const today = todayAR();
  if (!hasDatabase()) {
    return json({ demo: true, items: demoBills(today).map((b) => ({ ...b, bucket: classifyDue(b.dueDate, today, b.paid) })) });
  }
  const rows = await listBills(getDb());
  return json({ demo: false, items: rows.map((b) => ({ ...b, bucket: classifyDue(b.dueDate, today, b.status === "paid") })) });
}

const createInput = billInput.extend({ rawExtractedJson: z.unknown().optional(), sourceDocumentId: z.string().uuid().nullish() });

export async function POST(req: Request) {
  const body = await parseBody(req, createInput);
  if (!body.ok) return body.res;
  if (!hasDatabase()) return noDatabase();
  return json(await createBill(getDb(), body.data), { status: 201 });
}
