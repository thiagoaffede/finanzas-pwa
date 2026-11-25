import { desc } from "drizzle-orm";
import { getDollarQuotes, LABELS, type DollarQuote } from "@/lib/market/dollar-client";
import { json } from "@/lib/api";
import { getDb, hasDatabase, schema } from "@/lib/db";
import { getSettings, saveQuotes } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

/**
 * Cotizaciones para el header. Si la API no responde: las últimas guardadas en la base,
 * y si no hay ninguna, la cotización cargada a mano (marcada como manual).
 */
export async function GET() {
  const data = await getDollarQuotes();
  const db = hasDatabase() ? getDb() : null;
  // Cada consulta nueva (una cada ~20 min como máximo) queda en el historial.
  if (data.fresh && db) {
    await saveQuotes(
      db,
      data.quotes.map((q) => ({ house: q.house, buyCents: q.buyCents, sellCents: q.sellCents, quotedAt: new Date(q.updatedAt || data.fetchedAt) })),
    ).catch(() => {});
  }
  const { fresh: _fresh, ...rest } = data;
  void _fresh;
  let body: typeof rest & { manual?: boolean } = rest;
  if (rest.quotes.length === 0 && db) {
    const rows = await db.select().from(schema.marketQuotes).orderBy(desc(schema.marketQuotes.fetchedAt)).limit(50).catch(() => []);
    const latest = new Map<string, DollarQuote>();
    for (const r of rows)
      if (!latest.has(r.house)) latest.set(r.house, { house: r.house, name: LABELS[r.house] ?? r.house, buyCents: r.buyCents, sellCents: r.sellCents, updatedAt: r.quotedAt.toISOString() });
    if (latest.size) body = { ...rest, quotes: [...latest.values()], stale: true };
    else {
      const manual = (await getSettings(db).catch(() => null))?.usdManualCents;
      if (manual) body = { ...rest, quotes: [{ house: "manual", name: "Dólar", buyCents: manual, sellCents: manual, updatedAt: "" }], stale: false, manual: true };
    }
  }
  return json(body, { headers: { "Cache-Control": "private, max-age=300" } });
}
