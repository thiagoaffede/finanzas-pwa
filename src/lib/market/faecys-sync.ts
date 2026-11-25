import type { Db } from "@/lib/data/db-type";
import { getSettings, saveSettings, upsertScales } from "@/lib/data/repository";
import { circularToScales, parseFaecysCircular } from "@/lib/parsers/faecys-scales";

/**
 * Escalas de Empleados de Comercio (CCT 130/75) desde la circular que publica FAECYS
 * después de cada acuerdo paritario. Las novedades salen de la API de WordPress del sitio;
 * se toma la circular de escalas general más nueva y se lee el PDF (texto, no escaneado).
 */
const POSTS_URL = "https://www.faecys.org.ar/wp-json/wp/v2/posts?search=escalas&per_page=20&_fields=date,link,title,content";
/** Ramas con su propio convenio o escala: no son la general del CCT 130/75. */
const OTHER_BRANCH = /turismo|cereal|centros? de contacto|call|781\/20|547/i;

type Fetcher = typeof fetch;

export interface FaecysPost {
  date: string;
  link: string;
  title: string;
  pdfUrl: string;
}

export interface ScalesSyncResult {
  at: string;
  ok: boolean;
  /** Circular usada. */
  title?: string;
  link?: string;
  pdfUrl?: string;
  agreement?: string | null;
  /** Categorías y meses leídos. */
  categories?: number;
  from?: string;
  to?: string;
  saved?: number;
  /** true si la circular ya se había cargado y no se volvió a leer. */
  unchanged?: boolean;
  error?: string;
}

const decode = (s: string) =>
  s
    .replace(/&#8211;|&#8212;/g, "–")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

/** Respuesta de /wp-json/wp/v2/posts → la circular de escalas general (CCT 130/75) más nueva con PDF. */
export function pickLatestCircular(body: unknown): FaecysPost | null {
  if (!Array.isArray(body)) return null;
  const posts: FaecysPost[] = [];
  for (const p of body as { date?: string; link?: string; title?: { rendered?: string }; content?: { rendered?: string } }[]) {
    const title = decode(p.title?.rendered ?? "");
    if (!/escalas/i.test(title) || OTHER_BRANCH.test(title)) continue;
    if (!/130|general|comercio|cct/i.test(title) && !/escalas salariales/i.test(title)) continue;
    const pdf = /https:\/\/(?:www\.)?faecys\.org\.ar\/[^"'\s]+?\.pdf/i.exec(p.content?.rendered ?? "")?.[0];
    if (!pdf || !p.date || !p.link) continue;
    posts.push({ date: p.date, link: p.link, title, pdfUrl: pdf });
  }
  posts.sort((a, b) => b.date.localeCompare(a.date));
  return posts[0] ?? null;
}

/** El sitio de FAECYS a veces tarda en aceptar la conexión: un reintento antes de darse por vencido. */
async function fetchRetry(fetcher: Fetcher, url: string, init: RequestInit & { timeoutMs: number }): Promise<Response> {
  const { timeoutMs, ...rest } = init;
  try {
    return await fetcher(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    return fetcher(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  }
}

async function pdfPages(data: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

function describe(err: unknown): string {
  if (!(err instanceof Error)) return "error desconocido";
  if (err.name === "TimeoutError" || err.name === "AbortError") return "FAECYS no respondió a tiempo";
  const cause = (err as { cause?: { code?: string } }).cause;
  return (cause?.code ?? err.message).slice(0, 160);
}

/**
 * Busca la última circular de FAECYS y carga sus escalas (todas las categorías, mes por mes).
 * Si es la misma que ya se cargó, no vuelve a bajar el PDF salvo con `force`.
 */
export async function syncFaecysScales(db: Db, opts: { fetcher?: Fetcher; now?: Date; force?: boolean; readPdf?: (data: Uint8Array) => Promise<string[]> } = {}): Promise<ScalesSyncResult> {
  const fetcher = opts.fetcher ?? fetch;
  const at = (opts.now ?? new Date()).toISOString();
  let result: ScalesSyncResult;
  try {
    const res = await fetchRetry(fetcher, POSTS_URL, { headers: { accept: "application/json" }, cache: "no-store", timeoutMs: 20_000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // WordPress a veces antepone un BOM.
    const post = pickLatestCircular(JSON.parse((await res.text()).replace(/^﻿/, "")));
    if (!post) throw new Error("no se encontró la circular de escalas");

    const prev = (await getSettings(db)).scalesSync;
    if (!opts.force && prev?.ok && prev.pdfUrl === post.pdfUrl) {
      result = { ...prev, at, unchanged: true };
    } else {
      const pdf = await fetchRetry(fetcher, post.pdfUrl, { cache: "no-store", timeoutMs: 30_000 });
      if (!pdf.ok) throw new Error(`PDF: HTTP ${pdf.status}`);
      const pages = await (opts.readPdf ?? pdfPages)(new Uint8Array(await pdf.arrayBuffer()));
      const circular = parseFaecysCircular(pages);
      // Una circular con pocas categorías leídas probablemente cambió de formato: mejor no cargar nada.
      if (circular.pages.length < 15) throw new Error(`la circular cambió de formato (se leyeron ${circular.pages.length} categorías)`);
      const source = `FAECYS${circular.agreement ? ` acuerdo ${circular.agreement}` : ""}`;
      const scales = circularToScales(circular, source);
      await upsertScales(db, scales);
      const months = scales.map((s) => s.validFrom.slice(0, 7)).sort();
      result = {
        at,
        ok: true,
        title: post.title,
        link: post.link,
        pdfUrl: post.pdfUrl,
        agreement: circular.agreement,
        categories: circular.pages.length,
        from: months[0],
        to: months[months.length - 1],
        saved: scales.length,
      };
    }
  } catch (err) {
    const prev = (await getSettings(db)).scalesSync;
    // Se conserva qué circular estaba cargada para seguir mostrándola.
    result = { ...(prev?.ok ? prev : {}), at, ok: false, unchanged: undefined, error: describe(err) };
  }
  await saveSettings(db, { scalesSync: result });
  return result;
}

/** Más de un día sin revisar (o nunca). */
export function scalesSyncDue(sync: ScalesSyncResult | null, now: Date = new Date()): boolean {
  return !sync || now.getTime() - new Date(sync.at).getTime() > 20 * 3600_000;
}
