import { getDollarQuotes } from "@/lib/market/dollar-client";
import { json } from "@/lib/api";
import { getDb, hasDatabase } from "@/lib/db";
import { saveQuotes } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getDollarQuotes();
  // Cada consulta nueva (una cada ~20 min como máximo) queda en el historial.
  if (data.fresh && hasDatabase()) {
    await saveQuotes(
      getDb(),
      data.quotes.map((q) => ({ house: q.house, buyCents: q.buyCents, sellCents: q.sellCents, quotedAt: new Date(q.updatedAt || data.fetchedAt) })),
    ).catch(() => {});
  }
  const { fresh: _fresh, ...rest } = data;
  void _fresh;
  return json(rest, { headers: { "Cache-Control": "private, max-age=300" } });
}
