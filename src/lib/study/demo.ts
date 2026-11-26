import type { ISODate } from "@/types/finance";
import { addDays } from "@/lib/finance/dates";
import { STUDY_TEMPLATES } from "./templates";
import type { StudyCourse, StudyEvent, StudyMistake, StudySession } from "./types";

/** Datos de ejemplo para ver la sección sin base de datos (los ATI de la UNS a medio camino). */
export function demoStudy(today: ISODate) {
  const t = STUDY_TEMPLATES[0];
  const courses: StudyCourse[] = t.courses.map((c, ci) => ({
    id: `demo-c${ci}`,
    name: c.name,
    kind: "ati",
    status: "cursando",
    moodleName: null,
    reviewDays: c.reviewDays,
    notes: c.notes ?? null,
    blocks: c.blocks.map((b, i) => {
      // Aprobados los que vencían hace más de una semana; el resto, en camino.
      const done = !!b.target && b.target < addDays(today, -7);
      return {
        id: `demo-c${ci}-b${i}`,
        courseId: `demo-c${ci}`,
        position: i + 1,
        name: b.name,
        groupName: b.group ?? null,
        detail: b.detail ?? null,
        level: done ? (i % 3 === 0 ? 4 : 3) : b.target && b.target < today ? 1 : 0,
        status: done ? "aprobado" : b.target && b.target < today ? "en_curso" : "pendiente",
        targetDate: b.target ?? null,
        completedOn: done ? b.target! : null,
      };
    }),
  }));
  const base = { time: null, place: null, link: null, result: null, externalCourse: null } as const;
  const events: StudyEvent[] = [
    ...t.events.map((e, i) => ({ ...base, id: `demo-e${i}`, courseId: null, kind: e.kind, title: e.title, date: e.date, endDate: e.endDate ?? null, notes: e.notes ?? null, source: "plantilla" as const })),
    ...t.courses.flatMap((c, ci) =>
      c.events.map((e, i) => ({ ...base, id: `demo-c${ci}-e${i}`, courseId: `demo-c${ci}`, kind: e.kind, title: e.title, date: e.date, endDate: null, notes: e.notes ?? null, source: "plantilla" as const })),
    ),
  ];
  const sessions: StudySession[] = Array.from({ length: 10 }, (_, i) => ({
    id: `demo-s${i}`,
    courseId: `demo-c${i % 2}`,
    date: addDays(today, -Math.floor(i / 2)),
    minutes: i % 3 === 0 ? 50 : 25,
    source: "pomodoro",
    note: null,
  }));
  const mistakes: StudyMistake[] = [
    { id: "demo-m1", courseId: "demo-c0", blockId: "demo-c0-b2", date: addDays(today, -3), description: "Distribuí mal el signo en −(a − b)²", fixed: false },
    { id: "demo-m2", courseId: "demo-c1", blockId: null, date: addDays(today, -5), description: "Usé un dato implícito que el enunciado no daba", fixed: true },
  ];
  return { courses, events, sessions, mistakes, spend: [{ date: addDays(today, -4), amountCents: 1_250_000, description: "Fotocopias cuadernillo" }] };
}
