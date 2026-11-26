import type { ISODate } from "@/types/finance";
import { addDays, diffDays } from "@/lib/finance/dates";
import type { StudyBlock, StudyEvent } from "./types";

export type PaceState = "terminado" | "sin_fecha" | "al_dia" | "justo" | "atrasado";

export interface CoursePace {
  total: number;
  approved: number;
  remaining: number;
  /** 0 a 1. */
  progress: number;
  examDate: ISODate | null;
  daysToExam: number | null;
  /** Días para estudiar antes de arrancar el repaso. */
  studyDays: number | null;
  /** Días por bloque que quedan (null si no hay examen o no quedan bloques). */
  daysPerBlock: number | null;
  /** Bloques sin aprobar cuya fecha ya pasó. */
  overdue: StudyBlock[];
  /** Próximo bloque por aprobar. */
  next: StudyBlock | null;
  state: PaceState;
  message: string;
}

const fmt = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** El próximo examen sin resultado de un curso (hoy o más adelante). */
export function nextExam(events: Pick<StudyEvent, "kind" | "date" | "result" | "courseId">[], courseId: string, today: ISODate): ISODate | null {
  const dates = events
    .filter((e) => e.courseId === courseId && e.kind === "examen" && !e.result && e.date >= today)
    .map((e) => e.date)
    .sort();
  return dates[0] ?? null;
}

/** Cuánto falta y a qué ritmo hay que ir para llegar al examen con los bloques aprobados. */
export function coursePace(blocks: StudyBlock[], today: ISODate, examDate: ISODate | null, reviewDays = 3): CoursePace {
  const ordered = [...blocks].sort((a, b) => a.position - b.position);
  const total = ordered.length;
  const approved = ordered.filter((b) => b.status === "aprobado").length;
  const pending = ordered.filter((b) => b.status !== "aprobado");
  const remaining = pending.length;
  const overdue = pending.filter((b) => b.targetDate && b.targetDate < today);
  const next = pending[0] ?? null;
  const daysToExam = examDate ? diffDays(today, examDate) : null;
  const studyDays = daysToExam === null ? null : Math.max(0, daysToExam - reviewDays);
  const daysPerBlock = studyDays !== null && remaining > 0 ? studyDays / remaining : null;
  const base = { total, approved, remaining, progress: total ? approved / total : 0, examDate, daysToExam, studyDays, daysPerBlock, overdue, next };

  if (total === 0) return { ...base, state: "sin_fecha", message: "Cargá los bloques del curso para seguir el avance." };
  if (remaining === 0) {
    const msg = examDate ? `Terminaste los bloques. Te quedan ${daysToExam} días para repasar antes del examen.` : "Terminaste todos los bloques.";
    return { ...base, state: "terminado", message: msg };
  }
  const left = `${remaining === 1 ? "Queda 1 bloque" : `Quedan ${remaining} bloques`}`;
  if (!examDate) return { ...base, state: "sin_fecha", message: `${left}. Cargá la fecha del examen para calcular el ritmo.` };
  if (overdue.length) {
    const o = overdue[0];
    const more = overdue.length > 1 ? ` y ${overdue.length - 1} más` : "";
    return { ...base, state: "atrasado", message: `Vas atrasado: ${o.name} era para el ${fmt(o.targetDate!)}${more}. ${left} en ${daysToExam} días.` };
  }
  if (daysPerBlock! < 1) {
    return { ...base, state: "justo", message: `${left} y ${studyDays} días antes del repaso: más de un bloque por día.` };
  }
  const every = Math.floor(daysPerBlock!);
  return {
    ...base,
    state: every <= 2 ? "justo" : "al_dia",
    message: `${left} y ${daysToExam} días hasta el examen: un bloque cada ${every === 1 ? "día" : `${every} días`}.`,
  };
}

/**
 * Reparte fechas objetivo para los bloques sin aprobar, parejas entre hoy y el comienzo del repaso.
 * Si no alcanza el tiempo, varios bloques caen el mismo día (nunca antes de hoy ni después del examen).
 */
export function planTargets(blocks: StudyBlock[], today: ISODate, examDate: ISODate, reviewDays = 3): { id: string; targetDate: ISODate }[] {
  const pending = [...blocks].sort((a, b) => a.position - b.position).filter((b) => b.status !== "aprobado");
  if (!pending.length) return [];
  const toExam = Math.max(0, diffDays(today, examDate));
  const span = Math.max(0, toExam - reviewDays) || Math.max(0, toExam - 1);
  return pending.map((b, i) => ({ id: b.id, targetDate: addDays(today, Math.ceil(((i + 1) * span) / pending.length)) }));
}

/** Lunes de la semana de `d` (semana de lunes a domingo). */
export function weekStart(d: ISODate): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7;
  return addDays(d, -dow);
}

/** Días seguidos con algo de estudio, contando hasta hoy (o hasta ayer si hoy todavía no estudiaste). */
export function studyStreak(dates: ISODate[], today: ISODate): number {
  const set = new Set(dates);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
