import { describe, expect, it } from "vitest";
import { coursePace, nextExam, planTargets, studyStreak, weekStart } from "./pace";
import { guessEventKind, icsDateTime, maskIcalUrl, matchCourse, parseIcs, validIcalUrl } from "./ical";
import { buildStudyAlert } from "./alerts";
import { STUDY_TEMPLATES } from "./templates";
import type { StudyBlock, StudyCourse, StudyEvent } from "./types";

const block = (n: number, over: Partial<StudyBlock> = {}): StudyBlock => ({
  id: `b${n}`,
  courseId: "c1",
  position: n,
  name: `Bloque ${n}`,
  groupName: null,
  detail: null,
  level: 0,
  status: "pendiente",
  targetDate: null,
  completedOn: null,
  ...over,
});

const event = (over: Partial<StudyEvent>): StudyEvent => ({
  id: "e",
  courseId: null,
  kind: "otro",
  title: "Evento",
  date: "2026-12-01",
  endDate: null,
  time: null,
  place: null,
  link: null,
  notes: null,
  result: null,
  source: "manual",
  externalCourse: null,
  ...over,
});

describe("ritmo hasta el examen", () => {
  const today = "2026-11-26";

  it("calcula días por bloque descontando el repaso", () => {
    const blocks = [block(1, { status: "aprobado" }), block(2), block(3), block(4)];
    const p = coursePace(blocks, today, "2026-12-17", 3);
    expect(p).toMatchObject({ total: 4, approved: 1, remaining: 3, daysToExam: 21, studyDays: 18, daysPerBlock: 6, state: "al_dia" });
    expect(p.message).toBe("Quedan 3 bloques y 21 días hasta el examen: un bloque cada 6 días.");
    expect(p.next?.id).toBe("b2");
  });

  it("marca atrasado si un bloque sin aprobar ya pasó su fecha", () => {
    const p = coursePace([block(1, { targetDate: "2026-11-20" }), block(2)], today, "2026-12-17");
    expect(p.state).toBe("atrasado");
    expect(p.message).toContain("Bloque 1 era para el 20/11");
  });

  it("justo cuando quedan más bloques que días", () => {
    const blocks = Array.from({ length: 15 }, (_, i) => block(i + 1));
    expect(coursePace(blocks, today, "2026-12-08", 3).state).toBe("justo");
  });

  it("sin examen pide la fecha; todo aprobado avisa repaso", () => {
    expect(coursePace([block(1)], today, null).state).toBe("sin_fecha");
    const done = coursePace([block(1, { status: "aprobado" })], today, "2026-12-17");
    expect(done.state).toBe("terminado");
    expect(done.message).toContain("21 días para repasar");
  });

  it("toma el próximo examen sin resultado del curso", () => {
    const evs = [
      event({ courseId: "c1", kind: "examen", date: "2026-08-01" }),
      event({ courseId: "c1", kind: "examen", date: "2026-12-18" }),
      event({ courseId: "c1", kind: "examen", date: "2026-12-17", result: "ausente" }),
      event({ courseId: "c2", kind: "examen", date: "2026-12-01" }),
    ];
    expect(nextExam(evs, "c1", today)).toBe("2026-12-18");
  });

  it("reparte fechas parejas hasta el repaso y nunca antes de hoy", () => {
    const blocks = [block(1, { status: "aprobado" }), block(2), block(3), block(4)];
    expect(planTargets(blocks, today, "2026-12-17", 3)).toEqual([
      { id: "b2", targetDate: "2026-12-02" },
      { id: "b3", targetDate: "2026-12-08" },
      { id: "b4", targetDate: "2026-12-14" },
    ]);
    // El examen es mañana: todo para hoy.
    expect(planTargets([block(1), block(2)], today, "2026-11-27", 3).map((t) => t.targetDate)).toEqual(["2026-11-26", "2026-11-26"]);
  });

  it("semana y racha", () => {
    expect(weekStart("2026-11-26")).toBe("2026-11-23"); // jueves → lunes
    expect(weekStart("2026-11-29")).toBe("2026-11-23"); // domingo
    expect(studyStreak(["2026-11-24", "2026-11-25", "2026-11-26"], "2026-11-26")).toBe(3);
    expect(studyStreak(["2026-11-24", "2026-11-25"], "2026-11-26")).toBe(2); // hoy todavía no
    expect(studyStreak(["2026-11-20"], "2026-11-26")).toBe(0);
  });
});

const MOODLE_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2024100700//EN",
  "BEGIN:VEVENT",
  "UID:1234@moodle-ati.uns.edu.ar",
  "SUMMARY:Autoevaluación Bloque 3 cierra",
  "DESCRIPTION:Tenés tiempo hasta el cierre\\, después no se puede.\\nSuerte",
  "CLASS:PUBLIC",
  "LAST-MODIFIED:20261120T120000Z",
  "DTSTAMP:20261125T120000Z",
  "DTSTART:20261203T025900Z",
  "DTEND:20261203T025900Z",
  "CATEGORIES:ATI Matemática 2026",
  "URL:https://moodle-ati.uns.edu.ar/moodle/mod/quiz/view.php?id=99",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:uns-ati-20261130-2@uns.local",
  "DTSTART;VALUE=DATE:20261130",
  "DTEND;VALUE=DATE:20261212",
  "SUMMARY:Tutorías virtuales ATI",
  "DESCRIPTION:Desde el lunes 30/11 hasta el viernes 11/12.\\nTutorías virtual",
  " es de las actividades del programa ATI.",
  "BEGIN:VALARM",
  "TRIGGER;RELATED=START:-P1D",
  "END:VALARM",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:local-1",
  "DTSTART;TZID=America/Argentina/Buenos_Aires:20261217T080000",
  "SUMMARY:Examen ATI Análisis y Comprensión de Problemas",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:Sin UID, se ignora",
  "DTSTART:20261201T100000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("calendario iCal (Moodle)", () => {
  it("lee eventos: hora UTC a Argentina, días completos con fin inclusivo, líneas plegadas y escapes", () => {
    const evs = parseIcs(MOODLE_ICS);
    expect(evs).toHaveLength(3);
    expect(evs[0]).toMatchObject({
      uid: "1234@moodle-ati.uns.edu.ar",
      summary: "Autoevaluación Bloque 3 cierra",
      description: "Tenés tiempo hasta el cierre, después no se puede.\nSuerte",
      categories: "ATI Matemática 2026",
      date: "2026-12-02",
      time: "23:59",
      endDate: null,
    });
    expect(evs[1]).toMatchObject({ date: "2026-11-30", endDate: "2026-12-11", time: null });
    expect(evs[1].description).toContain("Tutorías virtuales de las actividades");
    expect(evs[2]).toMatchObject({ date: "2026-12-17", time: "08:00" });
  });

  it("fechas sueltas", () => {
    expect(icsDateTime("20261231T235900Z", "")).toEqual({ date: "2026-12-31", time: "20:59" });
    expect(icsDateTime("20260101T010000Z", "")).toEqual({ date: "2025-12-31", time: "22:00" });
    expect(icsDateTime("basura", "")).toBeNull();
  });

  it("adivina el tipo por el título", () => {
    expect(guessEventKind("Autoevaluación Bloque 3 cierra")).toBe("autoevaluacion");
    expect(guessEventKind("Examen ATI Matemática")).toBe("examen");
    expect(guessEventKind("Consulta por videoconferencia")).toBe("consulta");
    expect(guessEventKind("Entrega del TP 2")).toBe("entrega");
    expect(guessEventKind("Feriado")).toBe("otro");
  });

  it("asocia el curso por nombre en Moodle o por nombre", () => {
    const courses = [
      { id: "mat", name: "Matemática", moodleName: null },
      { id: "acp", name: "Análisis y Comprensión de Problemas", moodleName: "ACP-2026" },
    ];
    expect(matchCourse({ summary: "Autoevaluación 1", categories: "ATI MATEMATICA 2026" }, courses)).toBe("mat");
    expect(matchCourse({ summary: "Test 3", categories: "acp-2026" }, courses)).toBe("acp");
    expect(matchCourse({ summary: "Examen ATI Análisis y comprensión de problemas", categories: null }, courses)).toBe("acp");
    expect(matchCourse({ summary: "Feriado", categories: null }, courses)).toBeNull();
  });

  it("acepta solo links https de exportación y los muestra sin el token", () => {
    const link = "https://moodle-ati.uns.edu.ar/moodle/calendar/export_execute.php?userid=12&authtoken=abc123&preset_what=all&preset_time=recentupcoming";
    expect(validIcalUrl(link)?.hostname).toBe("moodle-ati.uns.edu.ar");
    expect(validIcalUrl("webcal://moodle.uns.edu.ar/calendar/export_execute.php?x=1")?.protocol).toBe("https:");
    expect(validIcalUrl("http://moodle-ati.uns.edu.ar/moodle/calendar/export_execute.php")).toBeNull();
    expect(validIcalUrl("https://moodle-ati.uns.edu.ar/moodle/login/index.php")).toBeNull();
    expect(validIcalUrl("no es un link")).toBeNull();
    expect(maskIcalUrl(link)).toBe("moodle-ati.uns.edu.ar…/calendar/export_execute.php");
    expect(maskIcalUrl(link)).not.toContain("abc123");
  });
});

describe("aviso diario de estudio", () => {
  const course: StudyCourse = {
    id: "c1",
    name: "Matemática",
    kind: "ati",
    status: "cursando",
    moodleName: null,
    reviewDays: 3,
    notes: null,
    blocks: [block(1, { name: "3.3 Cuadrática", targetDate: "2026-11-26" }), block(2, { name: "3.2 Lineal", targetDate: "2026-11-22" }), block(3, { targetDate: "2026-11-01", status: "aprobado" })],
  };

  it("junta examen, trámites que cierran y temas del día", () => {
    const a = buildStudyAlert(
      [course],
      [
        event({ courseId: "c1", kind: "examen", title: "Examen ATI Matemática", date: "2026-12-03", time: "08:00" }),
        event({ kind: "tramite", title: "Preinscripción", date: "2026-11-02", endDate: "2026-11-27" }),
        event({ kind: "consulta", title: "Consulta", date: "2026-11-28" }), // en 2 días: no avisa
      ],
      "2026-11-26",
    );
    expect(a?.title).toBe("Examen ATI Matemática en 7 días");
    expect(a?.body.split("\n")).toEqual([
      "Matemática: hoy cerrás 3.3 Cuadrática",
      "Preinscripción: cierra mañana",
      "Matemática: 1 tema atrasado (3.2 Lineal)",
      "Examen ATI Matemática: en 7 días a las 08:00",
    ]);
    expect(a?.url).toBe("/estudio");
  });

  it("no avisa exámenes con resultado ni si no hay nada", () => {
    const quiet = { ...course, blocks: [] };
    expect(buildStudyAlert([quiet], [event({ kind: "examen", date: "2026-11-26", result: "aprobado" })], "2026-11-26")).toBeNull();
  });
});

describe("plantillas", () => {
  it("los ATI de la UNS: 20 temas de Matemática y 15 bloques de ACP, con fechas antes del examen", () => {
    const t = STUDY_TEMPLATES.find((x) => x.id === "ati-uns-2026")!;
    const [mat, acp] = t.courses;
    expect(mat.blocks).toHaveLength(20);
    expect(acp.blocks).toHaveLength(15);
    for (const c of t.courses) for (const b of c.blocks) expect(b.target! < c.events[0].date).toBe(true);
    expect(new Set(t.events.map((e) => e.uid)).size).toBe(t.events.length);
  });
});
