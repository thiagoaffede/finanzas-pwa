import { getDb, hasDatabase, schema } from "@/lib/db";
import { toCSV } from "@/lib/csv";
import { todayAR } from "@/lib/finance";
import { demoBills, demoTransactions } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

/** GET /api/export?format=csv|json&what=transactions|bills|all */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const what = url.searchParams.get("what") ?? "transactions";
  const today = todayAR();

  let data: Record<string, Record<string, unknown>[]>;
  if (hasDatabase()) {
    const db = getDb();
    data = {
      transactions: await db.select().from(schema.transactions),
      bills: await db.select().from(schema.bills),
      ...(what === "all"
        ? {
            installments: await db.select().from(schema.installments),
            payslips: await db.select().from(schema.payslips),
            goals: await db.select().from(schema.goals),
            rentContracts: await db.select().from(schema.rentContracts),
          }
        : {}),
    };
  } else {
    data = { transactions: demoTransactions(today) as unknown as Record<string, unknown>[], bills: demoBills(today) as unknown as Record<string, unknown>[] };
  }

  const stamp = today.replace(/-/g, "");
  if (format === "json") {
    const body = what === "all" ? data : { [what]: data[what] ?? [] };
    return new Response(JSON.stringify(body, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="finanzas-${what}-${stamp}.json"` },
    });
  }
  const rows = data[what === "all" ? "transactions" : what] ?? [];
  return new Response(toCSV(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="finanzas-${what}-${stamp}.csv"` },
  });
}
