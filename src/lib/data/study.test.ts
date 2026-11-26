import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import type { Db } from "./db-type";
import * as study from "./study";
import { saveSettings, getSettings, createTransaction } from "./repository";
import { STUDY_TEMPLATES } from "@/lib/study/templates";
import { importIcs, syncMoodleCalendar } from "@/lib/study/moodle-sync";
import { createBackup, restoreBackup, parseBackup } from "@/lib/backup";

async function freshDb(): Promise<Db> {
  const client = new PGlite();
  const dir = path.resolve(import.meta.dirname, "../../../drizzle");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(path.join(dir, file), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await client.exec(stmt);
    }
  }
  return drizzle(client, { schema }) as unknown as Db;
}

const TODAY = "2026-11-26";

const ics = (events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
const vevent = (uid: string, summary: string, start: string, cat = "ATI Matemática 2026") =>
  ["BEGIN:VEVENT", `UID:${uid}`, `SUMMARY:${summary}`, `DTSTART:${start}`, `CATEGORIES:${cat}`, "END:VEVENT"].join("\r\n");

describe("estudio (PGlite)", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
  }, 30_000);

  it("carga la plantilla de los ATI una sola vez", async () => {
    const t = STUDY_TEMPLATES[0];
    expect(await study.loadTemplate(db, t)).toEqual({ created: 2, skipped: 0 });
    expect(await study.loadTemplate(db, t)).toEqual({ created: 0, skipped: 2 });
    const courses = await study.listCourses(db);
    expect(courses.map((c) => [c.name, c.blocks.length])).toEqual([
      ["Matemática", 20],
      ["Análisis y Comprensión de Problemas", 15],
    ]);
    expect(courses[0].blocks[0]).toMatchObject({ name: "1.1 Conjuntos numéricos", groupName: "Bloque 1 · Aritmética", targetDate: "2026-10-11", level: 0 });
    const events = await study.listEvents(db);
    expect(events.filter((e) => e.kind === "examen").map((e) => e.courseId).sort()).toEqual(courses.map((c) => c.id).sort());
    expect(events.find((e) => e.title === "Tutorías virtuales ATI")).toMatchObject({ date: "2026-11-30", endDate: "2026-12-11", courseId: null });
    // Las fechas que empezaron antes pero siguen vigentes entran en la lista "desde".
    expect((await study.listEvents(db, { from: "2026-12-01" })).some((e) => e.title === "Tutorías virtuales ATI")).toBe(true);
  });

  it("aprobar guarda el día; desmarcar lo borra; el nivel se guarda aparte", async () => {
    const [mat] = await study.listCourses(db);
    const b = mat.blocks[0];
    expect(await study.updateBlock(db, b.id, { status: "aprobado", level: 3 }, TODAY)).toMatchObject({ status: "aprobado", completedOn: TODAY, level: 3 });
    expect(await study.updateBlock(db, b.id, { status: "en_curso" }, TODAY)).toMatchObject({ status: "en_curso", completedOn: null, level: 3 });
    const added = await study.createBlock(db, { courseId: mat.id, name: "Simulacro" });
    expect(added.position).toBe(21);
  });

  it("repartir fechas pisa las de los temas que faltan", async () => {
    const [, acp] = await study.listCourses(db);
    await study.setBlockTargets(db, [{ id: acp.blocks[0].id, targetDate: "2026-12-01" }]);
    expect((await study.listBlocks(db, acp.id))[0].targetDate).toBe("2026-12-01");
  });

  it("importa un .ics: asocia el curso, no duplica y no borra lo que falta", async () => {
    const [mat] = await study.listCourses(db);
    const text = ics([vevent("m1", "Autoevaluación Bloque 3 cierra", "20261203T025900Z"), vevent("m2", "Consulta virtual", "20261201T130000Z", "Otro curso")]);
    expect(await importIcs(db, text, TODAY)).toMatchObject({ ok: true, events: 2, created: 2, updated: 0 });
    expect(await importIcs(db, text, TODAY)).toMatchObject({ created: 0, updated: 0 });
    const evs = await study.listEvents(db);
    expect(evs.find((e) => e.title.startsWith("Autoevaluación"))).toMatchObject({ kind: "autoevaluacion", courseId: mat.id, date: "2026-12-02", time: "23:59", source: "ics" });
    expect(evs.find((e) => e.title === "Consulta virtual")).toMatchObject({ kind: "consulta", courseId: null });
    expect(await importIcs(db, "hola", TODAY)).toMatchObject({ ok: false });
  });

  it("sincroniza Moodle con el link: actualiza, borra las futuras que ya no están y guarda el estado", async () => {
    const url = "https://moodle-ati.uns.edu.ar/moodle/calendar/export_execute.php?userid=1&authtoken=t&preset_what=all&preset_time=recentupcoming";
    await saveSettings(db, { moodleIcalUrl: url });
    let feed = ics([vevent("x1", "Examen ATI Matemática", "20261217T110000Z"), vevent("x2", "Consulta", "20261205T130000Z")]);
    const fetcher = (async (u: string | URL | Request) => {
      expect(String(u)).toBe(url);
      return new Response(feed, { status: 200 });
    }) as typeof fetch;
    const now = new Date("2026-11-26T12:00:00Z");
    expect(await syncMoodleCalendar(db, { today: TODAY, fetcher, now })).toMatchObject({ ok: true, events: 2, created: 2 });

    // El examen cambió de hora y la consulta ya no está.
    feed = ics([vevent("x1", "Examen ATI Matemática", "20261217T120000Z")]);
    expect(await syncMoodleCalendar(db, { today: TODAY, fetcher, now })).toMatchObject({ ok: true, events: 1, created: 0, updated: 1, removed: 1 });
    const moodle = (await study.listEvents(db)).filter((e) => e.source === "moodle");
    expect(moodle).toHaveLength(1);
    expect(moodle[0]).toMatchObject({ time: "09:00", kind: "examen" });
    expect((await getSettings(db)).moodleSync).toMatchObject({ ok: true, events: 1 });

    // Página de login en vez de calendario: error claro, no borra nada.
    feed = "<html>login</html>";
    expect(await syncMoodleCalendar(db, { today: TODAY, fetcher, now })).toMatchObject({ ok: false, error: expect.stringContaining("no es un calendario") });
    expect((await study.listEvents(db)).filter((e) => e.source === "moodle")).toHaveLength(1);
  });

  it("tiempo, errores y gastos de facultad", async () => {
    const [mat] = await study.listCourses(db);
    await study.createSession(db, { courseId: mat.id, date: TODAY, minutes: 25, source: "pomodoro" });
    await study.createSession(db, { courseId: null, date: "2026-11-25", minutes: 60, source: "manual" });
    expect((await study.listSessions(db, "2026-11-20")).map((s) => s.minutes)).toEqual([25, 60]);

    const m = await study.createMistake(db, { courseId: mat.id, blockId: mat.blocks[1].id, date: TODAY, description: "Signo mal distribuido" });
    await study.updateMistake(db, m.id, { fixed: true });
    expect(await study.listMistakes(db)).toMatchObject([{ fixed: true, description: "Signo mal distribuido" }]);

    await createTransaction(db, { date: TODAY, amountCents: 1_500_00, isIncome: false, paymentMethod: "contado", installmentsCount: 1, category: "Facultad", description: "Fotocopias", owedCents: 0 });
    await createTransaction(db, { date: TODAY, amountCents: 9_000_00, isIncome: false, paymentMethod: "contado", installmentsCount: 1, category: "Comida", owedCents: 0 });
    expect(await study.facultySpend(db, "2026-01-01")).toEqual([{ date: TODAY, amountCents: 1_500_00, description: "Fotocopias" }]);
  });

  it("el backup incluye el estudio y se restaura", async () => {
    const backup = await createBackup(db);
    expect(backup.tables.studyBlocks.length).toBe(36);
    const check = parseBackup(JSON.parse(JSON.stringify(backup)));
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    await restoreBackup(db, check.backup);
    expect((await study.listCourses(db)).map((c) => c.blocks.length)).toEqual([21, 15]);
  });

  it("borrar un curso se lleva sus temas, errores y su examen de plantilla", async () => {
    const [mat] = await study.listCourses(db);
    expect(await study.deleteCourse(db, mat.id)).toBe(true);
    expect(await study.listBlocks(db, mat.id)).toEqual([]);
    expect(await study.listMistakes(db)).toEqual([]);
    const evs = await study.listEvents(db);
    expect(evs.some((e) => e.title === "Examen ATI Matemática" && e.source === "plantilla")).toBe(false);
    // Las de Moodle quedan, sin curso.
    expect(evs.find((e) => e.source === "moodle")?.courseId).toBeNull();
  });
});
