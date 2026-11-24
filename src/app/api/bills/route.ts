import { asc } from "drizzle-orm";
import { getDb, hasDatabase, schema } from "@/lib/db";
import { json, noDatabase, parseBody } from "@/lib/api";
import { billInput } from "@/lib/schemas";
import { classifyDue, todayAR } from "@/lib/finance";
import { demoBills } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

/** Boletas con su estado de semáforo calculado. */
export async function GET() {
  const today = todayAR();
  if (!hasDatabase()) {
    return json({ demo: true, items: demoBills(today).map((b) => ({ ...b, bucket: classifyDue(b.dueDate, today, b.paid) })) });
  }
  const rows = await getDb().select().from(schema.bills).orderBy(asc(schema.bills.dueDate));
  return json({ demo: false, items: rows.map((b) => ({ ...b, bucket: classifyDue(b.dueDate, today, b.status === "paid") })) });
}

export async function POST(req: Request) {
  const body = await parseBody(req, billInput);
  if (!body.ok) return body.res;
  if (!hasDatabase()) return noDatabase();
  const [created] = await getDb().insert(schema.bills).values(body.data).returning();
  return json(created, { status: 201 });
}
