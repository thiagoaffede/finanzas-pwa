import type { Db } from "@/lib/data/db-type";
import { getIndices, saveSettings, upsertIndexValues } from "@/lib/data/repository";
import { addDays } from "@/lib/finance/dates";
import type { ISODate } from "@/types/finance";

/**
 * Índices oficiales para el alquiler, sin cargarlos a mano:
 * - IPC nivel general nacional (INDEC), variación mensual, desde la API de Series de Tiempo de datos.gob.ar.
 * - ICL diario (BCRA, variable 40) desde la API de Estadísticas Monetarias del BCRA.
 */
export const IPC_SERIES_ID = "148.3_INIVELNAL_DICI_M_26";
export const BCRA_ICL_VARIABLE = 40;
const IPC_URL = `https://apis.datos.gob.ar/series/api/series/?ids=${IPC_SERIES_ID}&representation_mode=percent_change&format=json&limit=1000`;
const ICL_URL = `https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/${BCRA_ICL_VARIABLE}`;
/** Primer valor publicado del ICL. */
const ICL_START: ISODate = "2020-07-01";

export const IPC_SOURCE = "INDEC (datos.gob.ar)";
export const ICL_SOURCE = "BCRA";

type Point = { date: ISODate; value: number };
type Fetcher = typeof fetch;

const isDate = (d: unknown): d is ISODate => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Respuesta de datos.gob.ar → variación mensual (fracción) con fecha = primer día del mes. */
export function parseIpcResponse(body: unknown): Point[] {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error("Respuesta de IPC sin datos");
  const out: Point[] = [];
  for (const row of data) {
    if (!Array.isArray(row)) continue;
    const [date, rate] = row;
    // El primer mes de la serie no tiene variación (null).
    if (!isDate(date) || typeof rate !== "number" || !Number.isFinite(rate)) continue;
    out.push({ date: `${date.slice(0, 7)}-01`, value: Math.round(rate * 1e8) / 1e8 });
  }
  return out;
}

/** Respuesta del BCRA (v4: results[].detalle[], v3: results[]) → valores diarios del ICL. */
export function parseIclResponse(body: unknown): Point[] {
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results)) throw new Error("Respuesta del BCRA sin resultados");
  const rows = results.flatMap((r) => (Array.isArray((r as { detalle?: unknown }).detalle) ? (r as { detalle: unknown[] }).detalle : [r]));
  const out: Point[] = [];
  for (const row of rows) {
    const { fecha, valor } = row as { fecha?: unknown; valor?: unknown };
    if (!isDate(fecha) || typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) continue;
    out.push({ date: fecha, value: valor });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

async function getJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const res = await fetcher(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function describe(err: unknown): string {
  if (!(err instanceof Error)) return "error desconocido";
  const cause = (err as { cause?: { code?: string; message?: string } }).cause;
  if (err.name === "TimeoutError" || err.name === "AbortError") return "no respondió a tiempo";
  return (cause?.code ?? cause?.message ?? err.message).slice(0, 160);
}

export interface IndexSyncPart {
  ok: boolean;
  /** Valores nuevos o actualizados en esta corrida. */
  saved: number;
  /** Último dato disponible (fecha y valor). */
  last: Point | null;
  error?: string;
}

export interface IndicesSyncResult {
  at: string;
  ipc: IndexSyncPart;
  icl: IndexSyncPart;
}

/**
 * Trae IPC e ICL de las fuentes oficiales y los guarda (pisan a los cargados a mano para las mismas fechas).
 * El ICL se pide desde unos días antes del último guardado; la primera vez, la serie completa.
 * Guarda el resultado en los ajustes (`indicesSync`) para mostrar cuándo se actualizó.
 */
export async function syncOfficialIndices(db: Db, opts: { fetcher?: Fetcher; today: ISODate; now?: Date }): Promise<IndicesSyncResult> {
  const fetcher = opts.fetcher ?? fetch;
  const idx = await getIndices(db);
  const current = { ipc: idx.ipc ?? [], icl: idx.icl ?? [] };

  const ipc: IndexSyncPart = { ok: false, saved: 0, last: null };
  try {
    const points = parseIpcResponse(await getJson(fetcher, IPC_URL));
    if (!points.length) throw new Error("sin valores");
    const known = new Map(current.ipc.map((p) => [`${p.month}-01`, p.rate]));
    const changed = points.filter((p) => known.get(p.date) === undefined || Math.abs((known.get(p.date) as number) - p.value) > 1e-8);
    ipc.saved = await upsertIndexValues(db, "IPC", changed, IPC_SOURCE);
    ipc.last = points[points.length - 1];
    ipc.ok = true;
  } catch (err) {
    ipc.error = `IPC (INDEC): ${describe(err)}`;
  }

  const icl: IndexSyncPart = { ok: false, saved: 0, last: null };
  try {
    const lastKnown = current.icl.at(-1)?.date;
    const desde = lastKnown ? addDays(lastKnown, -10) : ICL_START;
    const points = parseIclResponse(await getJson(fetcher, `${ICL_URL}?desde=${desde}&hasta=${opts.today}&limit=3000`));
    if (!points.length && !lastKnown) throw new Error("sin valores");
    const known = new Map(current.icl.map((p) => [p.date, p.value]));
    const changed = points.filter((p) => known.get(p.date) === undefined || Math.abs((known.get(p.date) as number) - p.value) > 1e-8);
    icl.saved = await upsertIndexValues(db, "ICL", changed, ICL_SOURCE);
    icl.last = points.at(-1) ?? current.icl.at(-1) ?? null;
    icl.ok = true;
  } catch (err) {
    icl.error = `ICL (BCRA): ${describe(err)}`;
  }

  const result: IndicesSyncResult = { at: (opts.now ?? new Date()).toISOString(), ipc, icl };
  await saveSettings(db, { indicesSync: result });
  return result;
}

/** Si la última actualización tiene más de un día (o nunca se hizo), corresponde actualizar. */
export function indicesSyncDue(sync: IndicesSyncResult | null, now: Date = new Date()): boolean {
  if (!sync) return true;
  return now.getTime() - new Date(sync.at).getTime() > 20 * 3600_000;
}
