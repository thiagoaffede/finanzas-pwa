import type { ISODate } from "@/types/finance";
import { diffDays } from "@/lib/finance/dates";
import type { PushPayload } from "@/lib/alerts";
import type { EventKind, StudyCourse, StudyEvent } from "./types";

/** Días antes en que avisamos cada tipo de fecha (0 = el mismo día). */
export const STUDY_ALERT_DAYS: Record<EventKind, number[]> = {
  examen: [7, 3, 1, 0],
  tramite: [3, 1, 0],
  entrega: [3, 1, 0],
  autoevaluacion: [1, 0],
  consulta: [1, 0],
  otro: [1, 0],
};

const when = (d: number) => (d === 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`);

/**
 * Aviso diario de estudio: fechas que se acercan (examen, trámites, consultas), temas que tenías
 * para hoy y cursos atrasados. Devuelve null si no hay nada que avisar.
 */
export function buildStudyAlert(courses: StudyCourse[], events: StudyEvent[], today: ISODate): PushPayload | null {
  const names = new Map(courses.map((c) => [c.id, c.name]));
  const lines: { order: number; text: string }[] = [];
  let title: string | null = null;

  for (const e of events) {
    if (e.result) continue;
    const d = diffDays(today, e.date);
    const course = e.courseId && !e.title.includes(names.get(e.courseId) ?? "\u0000") ? ` (${names.get(e.courseId)})` : "";
    const at = e.time ? ` a las ${e.time}` : "";
    if (STUDY_ALERT_DAYS[e.kind].includes(d)) {
      lines.push({ order: d, text: `${e.title}${course}: ${when(d)}${at}` });
      if (e.kind === "examen" && !title) title = `${e.title} ${when(d)}`;
    } else if (e.endDate && (e.kind === "tramite" || e.kind === "entrega")) {
      const toEnd = diffDays(today, e.endDate);
      if (d < 0 && [1, 0].includes(toEnd)) lines.push({ order: toEnd, text: `${e.title}: cierra ${when(toEnd)}` });
    }
  }

  const active = courses.filter((c) => c.status === "cursando");
  for (const c of active) {
    const pending = c.blocks.filter((b) => b.status !== "aprobado");
    const dueToday = pending.filter((b) => b.targetDate === today);
    const overdue = pending.filter((b) => b.targetDate && b.targetDate < today);
    if (dueToday.length) lines.push({ order: 0.5, text: `${c.name}: hoy cerrás ${dueToday.map((b) => b.name).join(", ")}` });
    if (overdue.length) lines.push({ order: 2, text: `${c.name}: ${overdue.length === 1 ? `1 tema atrasado (${overdue[0].name})` : `${overdue.length} temas atrasados`}` });
  }

  if (!lines.length) return null;
  lines.sort((a, b) => a.order - b.order);
  return {
    title: title ?? (lines.length === 1 ? lines[0].text : `Estudio: ${lines.length} cosas para tener en cuenta`),
    body: lines.map((l) => l.text).join("\n"),
    url: "/estudio",
    tag: `estudio-${today}`,
  };
}
