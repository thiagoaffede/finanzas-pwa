import { dollarApiResponse } from "@/lib/schemas";
import { toCents } from "@/lib/finance/money";

/**
 * Cotizaciones del dólar en Argentina (oficial, MEP, blue, CCL, cripto, tarjeta)
 * desde una API pública (por defecto dolarapi.com), con caché en memoria del server.
 * Fase 3: persistir cada consulta en `market_quotes` para tener historial.
 */

export interface DollarQuote {
  house: string;
  name: string;
  buyCents: number | null;
  sellCents: number | null;
  updatedAt: string;
}

export interface DollarSnapshot {
  quotes: DollarQuote[];
  fetchedAt: string;
  stale: boolean;
  /** true solo en la consulta que trajo datos nuevos (para guardarlos en el historial). */
  fresh?: boolean;
  error?: string;
}

const ORDER = ["oficial", "bolsa", "blue", "contadoconliqui", "cripto", "tarjeta", "mayorista"];
const LABELS: Record<string, string> = {
  oficial: "Oficial",
  bolsa: "MEP",
  blue: "Blue",
  contadoconliqui: "CCL",
  cripto: "Cripto",
  tarjeta: "Tarjeta",
  mayorista: "Mayorista",
};

let cache: { at: number; data: DollarSnapshot } | null = null;

export function normalizeDollarResponse(raw: unknown): DollarQuote[] {
  const parsed = dollarApiResponse.parse(raw);
  return parsed
    .map((q) => ({
      house: q.casa,
      name: LABELS[q.casa] ?? q.nombre,
      buyCents: q.compra === null ? null : toCents(q.compra),
      sellCents: q.venta === null ? null : toCents(q.venta),
      updatedAt: q.fechaActualizacion,
    }))
    .sort((a, b) => (ORDER.indexOf(a.house) + 99) % 99 - (ORDER.indexOf(b.house) + 99) % 99);
}

export async function getDollarQuotes(opts: { fetcher?: typeof fetch; now?: number } = {}): Promise<DollarSnapshot> {
  const now = opts.now ?? Date.now();
  const ttl = Number(process.env.DOLLAR_CACHE_MINUTES ?? 20) * 60_000;
  if (cache && now - cache.at < ttl) return { ...cache.data, fresh: false };

  const url = process.env.DOLLAR_API_URL ?? "https://dolarapi.com/v1/dolares";
  try {
    const res = await (opts.fetcher ?? fetch)(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const quotes = normalizeDollarResponse(await res.json());
    const data: DollarSnapshot = { quotes, fetchedAt: new Date(now).toISOString(), stale: false };
    cache = { at: now, data };
    return { ...data, fresh: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // Si falla, devolvemos lo último que tengamos marcado como viejo.
    if (cache) return { ...cache.data, stale: true, error };
    return { quotes: [], fetchedAt: new Date(now).toISOString(), stale: true, error };
  }
}

/** Convierte pesos a dólares de referencia con la cotización de venta. */
export function arsToUsdCents(arsCents: number, quote: DollarQuote): number | null {
  if (!quote.sellCents) return null;
  return Math.round((arsCents / quote.sellCents) * 100);
}

/** Solo para tests. */
export function __resetDollarCache() {
  cache = null;
}
