import { and, desc, eq, isNotNull } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import type { Db } from "@/lib/data/db-type";
import { saveQuotes } from "@/lib/data/repository";
import { getDollarQuotes } from "./dollar-client";

export const USD_HOUSES: Record<string, string> = { bolsa: "MEP", oficial: "Oficial", blue: "Blue", cripto: "Cripto", contadoconliqui: "CCL", tarjeta: "Tarjeta" };

export interface UsdRate {
  house: string;
  name: string;
  /** Pesos (en centavos) por dólar: precio de compra, lo que te dan si vendés tus dólares. */
  buyCents: number;
  sellCents: number | null;
  at: string;
  source: "en vivo" | "última guardada" | "manual";
}

/**
 * Cotización para valuar ahorro en dólares: la del día (y la guarda), o la última guardada,
 * o la que hayas cargado a mano en Configuración.
 */
export async function getUsdRate(db: Db | null, house: string, manualCents?: number | null): Promise<UsdRate | null> {
  const name = USD_HOUSES[house] ?? house;
  const live = await getDollarQuotes().catch(() => null);
  if (live && db && live.fresh)
    await saveQuotes(db, live.quotes.map((q) => ({ house: q.house, buyCents: q.buyCents, sellCents: q.sellCents, quotedAt: new Date(q.updatedAt || live.fetchedAt) }))).catch(() => {});
  const q = live?.quotes.find((x) => x.house === house);
  const buy = q?.buyCents ?? q?.sellCents;
  if (q && buy && !live?.stale) return { house, name, buyCents: buy, sellCents: q.sellCents, at: q.updatedAt || live!.fetchedAt, source: "en vivo" };
  if (db) {
    const [row] = await db
      .select()
      .from(s.marketQuotes)
      .where(and(eq(s.marketQuotes.house, house), isNotNull(s.marketQuotes.sellCents)))
      .orderBy(desc(s.marketQuotes.fetchedAt))
      .limit(1)
      .catch(() => []);
    if (row) return { house, name, buyCents: row.buyCents ?? row.sellCents!, sellCents: row.sellCents, at: row.quotedAt.toISOString(), source: "última guardada" };
  }
  if (manualCents && manualCents > 0) return { house: "manual", name: "manual", buyCents: manualCents, sellCents: manualCents, at: "", source: "manual" };
  return null;
}

/** Dólares (centavos de US$) → pesos (centavos) a la cotización dada. */
export function usdToArs(usdCents: number, rate: Pick<UsdRate, "buyCents">): number {
  return Math.round((usdCents * rate.buyCents) / 100);
}
