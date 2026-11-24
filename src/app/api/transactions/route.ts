import { desc } from "drizzle-orm";
import { getDb, hasDatabase, schema } from "@/lib/db";
import { json, noDatabase, parseBody } from "@/lib/api";
import { transactionInput } from "@/lib/schemas";
import { addMonthsToDate, splitCents, todayAR } from "@/lib/finance";
import { demoTransactions } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabase()) return json({ demo: true, items: demoTransactions(todayAR()) });
  const items = await getDb().select().from(schema.transactions).orderBy(desc(schema.transactions.date)).limit(200);
  return json({ demo: false, items });
}

/** Crea un gasto. Si es en cuotas, genera las cuotas futuras (primera cuota al mes siguiente). */
export async function POST(req: Request) {
  const body = await parseBody(req, transactionInput);
  if (!body.ok) return body.res;
  if (!hasDatabase()) return noDatabase();
  const tx = body.data;
  const db = getDb();

  const [created] = await db
    .insert(schema.transactions)
    .values({ ...tx, installmentsCount: tx.paymentMethod === "cuotas" ? tx.installmentsCount : 1 })
    .onConflictDoNothing({ target: schema.transactions.clientId })
    .returning();
  if (!created) return json({ duplicate: true }, { status: 200 });

  if (tx.paymentMethod === "cuotas" && tx.installmentsCount > 1) {
    const amounts = splitCents(tx.amountCents, tx.installmentsCount);
    await db.insert(schema.installments).values(
      amounts.map((amountCents, i) => ({
        transactionId: created.id,
        number: i + 1,
        total: tx.installmentsCount,
        dueDate: addMonthsToDate(tx.date, i + 1),
        amountCents,
      })),
    );
  }
  return json(created, { status: 201 });
}
