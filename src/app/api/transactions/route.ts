import { json, noDatabase, parseBody } from "@/lib/api";
import { getDb, hasDatabase } from "@/lib/db";
import { transactionInput } from "@/lib/schemas";
import { createTransaction, listTransactions } from "@/lib/data/repository";
import { todayAR } from "@/lib/finance";
import { demoTransactions } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabase()) return json({ demo: true, items: demoTransactions(todayAR()) });
  return json({ demo: false, items: await listTransactions(getDb(), { limit: 200 }) });
}

/** Crea un gasto. Si es en cuotas, genera las cuotas futuras (primera cuota al mes siguiente). */
export async function POST(req: Request) {
  const body = await parseBody(req, transactionInput);
  if (!body.ok) return body.res;
  if (!hasDatabase()) return noDatabase();
  const created = await createTransaction(getDb(), body.data);
  return created ? json(created, { status: 201 }) : json({ duplicate: true });
}
