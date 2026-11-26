import type { ISODate } from "@/types/finance";
import { addDays } from "@/lib/finance/dates";
import type { EventKind } from "./types";

/** Evento leído de un calendario iCal (.ics), como el que exporta Moodle. */
export interface IcsEvent {
  uid: string;
  summary: string;
  description: string | null;
  /** En Moodle: el nombre corto del curso. */
  categories: string | null;
  url: string | null;
  /** Fecha y hora en Argentina (UTC-3, sin horario de verano). */
  date: ISODate;
  time: string | null;
  /** Último día (inclusive) si dura más de un día. */
  endDate: ISODate | null;
}

/** Desarma las líneas plegadas (RFC 5545: una línea que empieza con espacio o tab sigue a la anterior). */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

const AR_OFFSET_H = -3;

/** "20261201T130000Z", "20261201T100000" (con TZID) o "20261201" → fecha y hora de Argentina. */
export function icsDateTime(value: string, params: string): { date: ISODate; time: string | null } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mi, , z] = m;
  if (!hh || /VALUE=DATE(?!-)/i.test(params)) return { date: `${y}-${mo}-${d}`, time: null };
  // Hora flotante o con TZID: se toma tal cual (Moodle de la UNS usa la hora de Argentina).
  if (!z) return { date: `${y}-${mo}-${d}`, time: `${hh}:${mi}` };
  const t = new Date(Date.UTC(+y, +mo - 1, +d, +hh + AR_OFFSET_H, +mi));
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}` };
}

/** Lee los VEVENT de un archivo iCal. Ignora los que no tienen UID o fecha. */
export function parseIcs(text: string): IcsEvent[] {
  const out: IcsEvent[] = [];
  let cur: Record<string, { value: string; params: string }> | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      const start = cur?.DTSTART && icsDateTime(cur.DTSTART.value, cur.DTSTART.params);
      if (cur?.UID && start) {
        const end = cur.DTEND && icsDateTime(cur.DTEND.value, cur.DTEND.params);
        // En eventos de día completo DTEND es el día siguiente al último.
        const last = end ? (end.time === null ? addDays(end.date, -1) : end.date) : null;
        out.push({
          uid: cur.UID.value.trim(),
          summary: unescape(cur.SUMMARY?.value ?? "") || "Evento de Moodle",
          description: cur.DESCRIPTION ? unescape(cur.DESCRIPTION.value) || null : null,
          categories: cur.CATEGORIES ? unescape(cur.CATEGORIES.value) || null : null,
          url: cur.URL ? cur.URL.value.trim() || null : null,
          ...start,
          endDate: last && last > start.date ? last : null,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const [name, ...params] = line.slice(0, colon).split(";");
    cur[name.toUpperCase()] = { value: line.slice(colon + 1), params: params.join(";") };
  }
  return out;
}

/** Adivina el tipo de fecha por el título (Moodle escribe "Autoevaluación 1 cierra", "Consulta virtual", etc.). */
export function guessEventKind(summary: string): EventKind {
  const s = summary.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/examen|parcial|final|mesa/.test(s)) return "examen";
  if (/autoevaluacion|cuestionario|quiz|test\b/.test(s)) return "autoevaluacion";
  if (/consulta|videoconferencia|encuentro|clase|zoom|meet/.test(s)) return "consulta";
  if (/entrega|tarea|trabajo practico|\btp\b|vence|assignment|due/.test(s)) return "entrega";
  return "otro";
}

/** Solo links de exportación de calendario por https (no se guarda ninguna contraseña). */
export function validIcalUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (!/export_execute\.php$/i.test(u.pathname) && !/\.ics$/i.test(u.pathname)) return null;
  return u;
}

/** Muestra el link sin el token (para la pantalla). */
export function maskIcalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.host}${u.pathname.replace(/^.*\/(calendar\/)/, "…/$1")}`;
  } catch {
    return "link guardado";
  }
}

const fold = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Busca a qué curso corresponde un evento: por el nombre en Moodle (si lo cargaste) o por el nombre del curso. */
export function matchCourse(ev: Pick<IcsEvent, "summary" | "categories">, courses: { id: string; name: string; moodleName: string | null }[]): string | null {
  const hay = fold(`${ev.categories ?? ""} ${ev.summary}`);
  for (const c of courses) if (c.moodleName && hay.includes(fold(c.moodleName))) return c.id;
  for (const c of courses) if (fold(c.name).length >= 3 && hay.includes(fold(c.name))) return c.id;
  return null;
}
