import { and, asc, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import type { Db } from "./db-type";
import type { ISODate } from "@/types/finance";
import { addDays } from "@/lib/finance/dates";
import type { EventSource, StudyBlock, StudyCourse, StudyEvent, StudyMistake, StudySession } from "@/lib/study/types";
import type { BlockInput, BlockPatch, CourseInput, CoursePatch, EventInput, EventPatch, MistakeInput, MistakePatch, SessionInput } from "@/lib/study/schemas";
import type { CourseTemplate, StudyTemplate } from "@/lib/study/templates";

/** Acceso a datos de la sección Estudio. */

type BlockRow = typeof s.studyBlocks.$inferSelect;
type EventRow = typeof s.studyEvents.$inferSelect;

const toBlock = (b: BlockRow): StudyBlock => ({
  id: b.id,
  courseId: b.courseId,
  position: b.position,
  name: b.name,
  groupName: b.groupName,
  detail: b.detail,
  level: b.level,
  status: b.status as StudyBlock["status"],
  targetDate: b.targetDate,
  completedOn: b.completedOn,
});

const toEvent = (e: EventRow): StudyEvent => ({
  id: e.id,
  courseId: e.courseId,
  kind: e.kind as StudyEvent["kind"],
  title: e.title,
  date: e.date,
  endDate: e.endDate,
  time: e.time,
  place: e.place,
  link: e.link,
  notes: e.notes,
  result: e.result as StudyEvent["result"],
  source: e.source as StudyEvent["source"],
  externalCourse: e.externalCourse,
});

// ─── Cursos ─────────────────────────────────────────────────────────────────
export async function listCourses(db: Db): Promise<StudyCourse[]> {
  const courses = await db.select().from(s.studyCourses).where(eq(s.studyCourses.archived, false)).orderBy(asc(s.studyCourses.createdAt));
  if (!courses.length) return [];
  const blocks = await db
    .select()
    .from(s.studyBlocks)
    .where(inArray(s.studyBlocks.courseId, courses.map((c) => c.id)))
    .orderBy(asc(s.studyBlocks.position));
  return courses.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind as StudyCourse["kind"],
    status: c.status as StudyCourse["status"],
    moodleName: c.moodleName,
    reviewDays: c.reviewDays,
    notes: c.notes,
    blocks: blocks.filter((b) => b.courseId === c.id).map(toBlock),
  }));
}

/** Crea el curso con sus bloques ("Bloque 1", "Bloque 2"…, o los nombres que vengan). */
export async function createCourse(db: Db, input: CourseInput) {
  const [course] = await db
    .insert(s.studyCourses)
    .values({ name: input.name, kind: input.kind, moodleName: input.moodleName ?? null, reviewDays: input.reviewDays, notes: input.notes ?? null })
    .returning();
  const names = Array.from({ length: input.blocks }, (_, i) => `Bloque ${i + 1}`);
  if (names.length) await db.insert(s.studyBlocks).values(names.map((name, i) => ({ courseId: course.id, position: i + 1, name })));
  if (input.examDate) await db.insert(s.studyEvents).values({ courseId: course.id, kind: "examen", title: `Examen ${input.name}`, date: input.examDate });
  return course;
}

/**
 * Carga un curso armado (plantilla) con sus temas, fechas objetivo y fechas del calendario.
 * Si ya existe un curso con ese nombre no hace nada (se puede tocar el botón dos veces sin duplicar).
 */
export async function createCourseFromTemplate(db: Db, t: CourseTemplate): Promise<{ created: boolean; id: string }> {
  const [existing] = await db
    .select({ id: s.studyCourses.id })
    .from(s.studyCourses)
    .where(and(eq(s.studyCourses.name, t.name), eq(s.studyCourses.archived, false)));
  if (existing) return { created: false, id: existing.id };
  const [course] = await db
    .insert(s.studyCourses)
    .values({ name: t.name, kind: "ati", moodleName: t.moodleName ?? null, reviewDays: t.reviewDays, notes: t.notes ?? null })
    .returning();
  await db.insert(s.studyBlocks).values(
    t.blocks.map((b, i) => ({ courseId: course.id, position: i + 1, name: b.name, groupName: b.group ?? null, detail: b.detail ?? null, targetDate: b.target ?? null })),
  );
  if (t.events.length) {
    await db
      .insert(s.studyEvents)
      .values(
        t.events.map((e) => ({
          courseId: course.id,
          kind: e.kind,
          title: e.title,
          date: e.date,
          endDate: e.endDate ?? null,
          notes: e.notes ?? null,
          source: "plantilla",
          externalUid: `${e.uid}:${course.id}`,
        })),
      )
      .onConflictDoNothing();
  }
  return { created: true, id: course.id };
}

export async function updateCourse(db: Db, id: string, patch: CoursePatch & { archived?: boolean }) {
  const [row] = await db
    .update(s.studyCourses)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(s.studyCourses.id, id))
    .returning();
  return row ?? null;
}

/** Borra el curso con sus temas y errores; sus fechas de plantilla también (las demás quedan sin curso). */
export async function deleteCourse(db: Db, id: string) {
  await db.delete(s.studyEvents).where(and(eq(s.studyEvents.courseId, id), eq(s.studyEvents.source, "plantilla")));
  const rows = await db.delete(s.studyCourses).where(eq(s.studyCourses.id, id)).returning({ id: s.studyCourses.id });
  return rows.length > 0;
}

/** Carga una plantilla completa: sus cursos y sus fechas generales. No duplica si se toca dos veces. */
export async function loadTemplate(db: Db, t: StudyTemplate): Promise<{ created: number; skipped: number }> {
  let created = 0;
  for (const c of t.courses) if ((await createCourseFromTemplate(db, c)).created) created++;
  if (t.events.length) {
    await db
      .insert(s.studyEvents)
      .values(t.events.map((e) => ({ kind: e.kind, title: e.title, date: e.date, endDate: e.endDate ?? null, notes: e.notes ?? null, source: "plantilla", externalUid: e.uid })))
      .onConflictDoNothing();
  }
  return { created, skipped: t.courses.length - created };
}

// ─── Bloques ────────────────────────────────────────────────────────────────
export async function listBlocks(db: Db, courseId: string): Promise<StudyBlock[]> {
  const rows = await db.select().from(s.studyBlocks).where(eq(s.studyBlocks.courseId, courseId)).orderBy(asc(s.studyBlocks.position));
  return rows.map(toBlock);
}

export async function createBlock(db: Db, input: BlockInput) {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${s.studyBlocks.position}), 0)` })
    .from(s.studyBlocks)
    .where(eq(s.studyBlocks.courseId, input.courseId));
  const [row] = await db
    .insert(s.studyBlocks)
    .values({ courseId: input.courseId, name: input.name, position: Number(max) + 1, targetDate: input.targetDate ?? null })
    .returning();
  return toBlock(row);
}

/** Cambia el estado, el nombre o la fecha objetivo. Al aprobar guarda el día (o lo borra si se desmarca). */
export async function updateBlock(db: Db, id: string, patch: BlockPatch, today: ISODate) {
  const set: Partial<typeof s.studyBlocks.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.detail !== undefined) set.detail = patch.detail;
  if (patch.level !== undefined) set.level = patch.level;
  if (patch.targetDate !== undefined) set.targetDate = patch.targetDate;
  if (patch.status !== undefined) {
    set.status = patch.status;
    set.completedOn = patch.status === "aprobado" ? (patch.completedOn ?? today) : null;
  }
  const [row] = await db.update(s.studyBlocks).set(set).where(eq(s.studyBlocks.id, id)).returning();
  return row ? toBlock(row) : null;
}

export async function deleteBlock(db: Db, id: string) {
  const rows = await db.delete(s.studyBlocks).where(eq(s.studyBlocks.id, id)).returning({ id: s.studyBlocks.id });
  return rows.length > 0;
}

export async function setBlockTargets(db: Db, targets: { id: string; targetDate: ISODate }[]) {
  for (const t of targets) await db.update(s.studyBlocks).set({ targetDate: t.targetDate, updatedAt: new Date() }).where(eq(s.studyBlocks.id, t.id));
}

// ─── Fechas ─────────────────────────────────────────────────────────────────
/** Fechas desde `from` (por defecto, todas). */
export async function listEvents(db: Db, opts: { from?: ISODate } = {}): Promise<StudyEvent[]> {
  const rows = await db
    .select()
    .from(s.studyEvents)
    .where(opts.from ? or(gte(s.studyEvents.date, opts.from), gte(s.studyEvents.endDate, opts.from)) : undefined)
    .orderBy(asc(s.studyEvents.date), asc(s.studyEvents.time));
  return rows.map(toEvent);
}

export async function createEvent(db: Db, input: EventInput) {
  const [row] = await db
    .insert(s.studyEvents)
    .values({
      courseId: input.courseId ?? null,
      kind: input.kind,
      title: input.title,
      date: input.date,
      endDate: input.endDate ?? null,
      time: input.time ?? null,
      place: input.place ?? null,
      link: input.link ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return toEvent(row);
}

export async function updateEvent(db: Db, id: string, patch: EventPatch) {
  const [row] = await db
    .update(s.studyEvents)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(s.studyEvents.id, id))
    .returning();
  return row ? toEvent(row) : null;
}

export async function deleteEvent(db: Db, id: string) {
  const rows = await db.delete(s.studyEvents).where(eq(s.studyEvents.id, id)).returning({ id: s.studyEvents.id });
  return rows.length > 0;
}

export interface ExternalEvent {
  uid: string;
  title: string;
  kind: StudyEvent["kind"];
  date: ISODate;
  endDate: ISODate | null;
  time: string | null;
  link: string | null;
  notes: string | null;
  externalCourse: string | null;
  courseId: string | null;
}

/**
 * Guarda fechas de un calendario externo (Moodle o un archivo .ics): crea las nuevas y actualiza
 * título/fecha de las que ya estaban (sin tocar el curso, el tipo ni el resultado que hayas cambiado a mano).
 * Con `removeMissing` (Moodle), borra las futuras que ya no están en el calendario; las pasadas se conservan.
 */
export async function upsertExternalEvents(
  db: Db,
  source: Extract<EventSource, "moodle" | "ics">,
  events: ExternalEvent[],
  today: ISODate,
  opts: { removeMissing?: boolean } = {},
): Promise<{ created: number; updated: number; removed: number }> {
  const existing = await db.select().from(s.studyEvents).where(and(eq(s.studyEvents.source, source), isNotNull(s.studyEvents.externalUid)));
  const byUid = new Map(existing.map((e) => [e.externalUid!, e]));
  let created = 0;
  let updated = 0;
  for (const e of events) {
    const prev = byUid.get(e.uid);
    if (!prev) {
      await db.insert(s.studyEvents).values({
        courseId: e.courseId,
        kind: e.kind,
        title: e.title,
        date: e.date,
        endDate: e.endDate,
        time: e.time,
        link: e.link,
        notes: e.notes,
        source,
        externalUid: e.uid,
        externalCourse: e.externalCourse,
      });
      created++;
    } else if (prev.title !== e.title || prev.date !== e.date || prev.endDate !== e.endDate || prev.time !== e.time || prev.link !== e.link) {
      await db
        .update(s.studyEvents)
        .set({ title: e.title, date: e.date, endDate: e.endDate, time: e.time, link: e.link, notes: e.notes, externalCourse: e.externalCourse, courseId: prev.courseId ?? e.courseId, updatedAt: new Date() })
        .where(eq(s.studyEvents.id, prev.id));
      updated++;
    }
  }
  if (!opts.removeMissing) return { created, updated, removed: 0 };
  const seen = new Set(events.map((e) => e.uid));
  const gone = existing.filter((e) => !seen.has(e.externalUid!) && e.date >= today).map((e) => e.id);
  if (gone.length) await db.delete(s.studyEvents).where(inArray(s.studyEvents.id, gone));
  return { created, updated, removed: gone.length };
}

// ─── Tiempo de estudio ──────────────────────────────────────────────────────
export async function listSessions(db: Db, from: ISODate): Promise<StudySession[]> {
  const rows = await db.select().from(s.studySessions).where(gte(s.studySessions.date, from)).orderBy(desc(s.studySessions.date), desc(s.studySessions.createdAt));
  return rows.map((r) => ({ id: r.id, courseId: r.courseId, date: r.date, minutes: r.minutes, source: r.source as StudySession["source"], note: r.note }));
}

export async function createSession(db: Db, input: SessionInput) {
  const [row] = await db
    .insert(s.studySessions)
    .values({ courseId: input.courseId ?? null, date: input.date, minutes: input.minutes, source: input.source, note: input.note ?? null })
    .returning();
  return row;
}

export async function deleteSession(db: Db, id: string) {
  const rows = await db.delete(s.studySessions).where(eq(s.studySessions.id, id)).returning({ id: s.studySessions.id });
  return rows.length > 0;
}

// ─── Planilla de errores ────────────────────────────────────────────────────
export async function listMistakes(db: Db): Promise<StudyMistake[]> {
  const rows = await db.select().from(s.studyMistakes).orderBy(asc(s.studyMistakes.fixed), desc(s.studyMistakes.date), desc(s.studyMistakes.createdAt));
  return rows.map((r) => ({ id: r.id, courseId: r.courseId, blockId: r.blockId, date: r.date, description: r.description, fixed: r.fixed }));
}

export async function createMistake(db: Db, input: MistakeInput) {
  const [row] = await db
    .insert(s.studyMistakes)
    .values({ courseId: input.courseId ?? null, blockId: input.blockId ?? null, date: input.date, description: input.description })
    .returning();
  return row;
}

export async function updateMistake(db: Db, id: string, patch: MistakePatch) {
  const [row] = await db
    .update(s.studyMistakes)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(s.studyMistakes.id, id))
    .returning();
  return row ?? null;
}

export async function deleteMistake(db: Db, id: string) {
  const rows = await db.delete(s.studyMistakes).where(eq(s.studyMistakes.id, id)).returning({ id: s.studyMistakes.id });
  return rows.length > 0;
}

/** Gastos cargados con la categoría "Facultad", desde `from`. */
export async function facultySpend(db: Db, from: ISODate): Promise<{ date: ISODate; amountCents: number; description: string | null }[]> {
  return db
    .select({ date: s.transactions.date, amountCents: s.transactions.amountCents, description: s.transactions.description })
    .from(s.transactions)
    .where(and(eq(s.transactions.isIncome, false), eq(s.transactions.category, "Facultad"), gte(s.transactions.date, from)))
    .orderBy(desc(s.transactions.date));
}

/** Todo lo que muestra la página Estudio. */
export async function loadStudy(db: Db, today: ISODate) {
  const [courses, events, sessions, mistakes, spend] = await Promise.all([
    listCourses(db),
    listEvents(db, { from: addDays(today, -60) }),
    listSessions(db, addDays(today, -60)),
    listMistakes(db),
    facultySpend(db, `${today.slice(0, 4)}-01-01`),
  ]);
  return { courses, events, sessions, mistakes, spend };
}
export type StudyData = Awaited<ReturnType<typeof loadStudy>>;
