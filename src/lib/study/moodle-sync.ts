import type { Db } from "@/lib/data/db-type";
import type { ISODate } from "@/types/finance";
import { getSettings, saveSettings } from "@/lib/data/repository";
import { listCourses, upsertExternalEvents, type ExternalEvent } from "@/lib/data/study";
import { guessEventKind, matchCourse, parseIcs, validIcalUrl, type IcsEvent } from "./ical";
import type { EventSource } from "./types";

export interface MoodleSyncResult {
  at: string;
  ok: boolean;
  events?: number;
  created?: number;
  updated?: number;
  removed?: number;
  error?: string;
}

type Fetcher = typeof fetch;

/** Pasa los eventos del .ics al formato de la base, con su curso y su tipo. */
export async function toExternalEvents(db: Db, events: IcsEvent[]): Promise<ExternalEvent[]> {
  const courses = await listCourses(db);
  return events.map((e) => ({
    uid: e.uid,
    title: e.summary.slice(0, 160),
    kind: guessEventKind(e.summary),
    date: e.date,
    endDate: e.endDate,
    time: e.time,
    link: e.url && /^https?:\/\//i.test(e.url) ? e.url.slice(0, 500) : null,
    notes: e.description?.slice(0, 1000) ?? null,
    externalCourse: e.categories?.slice(0, 160) ?? null,
    courseId: matchCourse(e, courses),
  }));
}

/** Guarda los eventos de un archivo .ics subido a mano. */
export async function importIcs(db: Db, text: string, today: ISODate, source: Extract<EventSource, "ics" | "moodle"> = "ics") {
  const events = parseIcs(text);
  if (!events.length) return { ok: false as const, error: "El archivo no tiene eventos de calendario (.ics)." };
  const saved = await upsertExternalEvents(db, source, await toExternalEvents(db, events), today);
  return { ok: true as const, events: events.length, ...saved };
}

/** Baja el calendario de Moodle (link de exportación iCal) y actualiza las fechas. */
export async function syncMoodleCalendar(db: Db, opts: { today: ISODate; fetcher?: Fetcher; now?: Date }): Promise<MoodleSyncResult> {
  const settings = await getSettings(db);
  const at = (opts.now ?? new Date()).toISOString();
  if (!settings.moodleIcalUrl) return { at, ok: false, error: "No hay link de calendario cargado." };
  const url = validIcalUrl(settings.moodleIcalUrl);
  let result: MoodleSyncResult;
  try {
    if (!url) throw new Error("El link guardado no es un link de exportación de calendario.");
    const res = await (opts.fetcher ?? fetch)(url, { headers: { accept: "text/calendar, */*" }, signal: AbortSignal.timeout(20_000), redirect: "follow" });
    if (!res.ok) throw new Error(`Moodle respondió ${res.status}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("La respuesta no es un calendario. ¿El link venció o es el de la página de login?");
    const events = parseIcs(text);
    const saved = await upsertExternalEvents(db, "moodle", await toExternalEvents(db, events), opts.today, { removeMissing: true });
    result = { at, ok: true, events: events.length, ...saved };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const error =
      e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
        ? "Moodle tardó demasiado en responder. Probá más tarde."
        : msg === "fetch failed"
          ? "No se pudo conectar con Moodle. Probá más tarde."
          : msg.slice(0, 200);
    result = { at, ok: false, error };
  }
  await saveSettings(db, { moodleSync: result });
  return result;
}

export function moodleSyncDue(url: string | null, sync: MoodleSyncResult | null, now: Date = new Date()): boolean {
  if (!url) return false;
  if (!sync) return true;
  return now.getTime() - new Date(sync.at).getTime() > 12 * 3600_000;
}
