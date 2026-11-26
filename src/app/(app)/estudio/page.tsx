import type { Metadata } from "next";
import Link from "next/link";
import { Flame } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoNotice } from "@/components/dashboard/demo-notice";
import { PushToggle } from "@/components/forms/push-toggle";
import { CourseCard } from "@/components/study/course-card";
import { EventsCard } from "@/components/study/events-card";
import { Pomodoro } from "@/components/study/pomodoro";
import { MistakesCard } from "@/components/study/mistakes-card";
import { MoodleCard } from "@/components/study/moodle-card";
import { TemplateLoader } from "@/components/study/template-loader";
import { NewCourseButton } from "@/components/study/new-course";
import { SessionDelete } from "@/components/study/session-delete";
import { minutesLabel, shortDate } from "@/components/study/format";
import { getDb, hasDatabase } from "@/lib/db";
import { getSettings } from "@/lib/data/repository";
import { loadStudy, type StudyData } from "@/lib/data/study";
import { refreshStaleData } from "@/lib/market/refresh";
import { addDays, formatARS, todayAR } from "@/lib/finance";
import { coursePace, nextExam, studyStreak, weekStart } from "@/lib/study/pace";
import { maskIcalUrl } from "@/lib/study/ical";
import { demoStudy } from "@/lib/study/demo";
import { STUDY_TEMPLATES } from "@/lib/study/templates";
import { LEVEL_LABEL } from "@/lib/study/types";
import type { AppSettings } from "@/lib/data/repository";

export const metadata: Metadata = { title: "Estudio" };
export const dynamic = "force-dynamic";

export default async function EstudioPage() {
  const today = todayAR();
  const canSave = hasDatabase();
  let data: StudyData;
  let settings: AppSettings | null = null;
  if (canSave) {
    const db = getDb();
    [data, settings] = await Promise.all([loadStudy(db, today), getSettings(db)]);
    refreshStaleData(settings, today);
  } else {
    data = demoStudy(today);
  }
  const { courses, events, sessions, mistakes, spend } = data;
  const active = courses.filter((c) => c.status !== "aprobado");
  const courseOpts = courses.map((c) => ({ id: c.id, name: c.name }));

  // Tiempo de estudio
  const monday = weekStart(today);
  const week = sessions.filter((s) => s.date >= monday);
  const weekMin = week.reduce((a, s) => a + s.minutes, 0);
  const todayMin = sessions.filter((s) => s.date === today).reduce((a, s) => a + s.minutes, 0);
  const streak = studyStreak(sessions.map((s) => s.date), today);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const perDay = days.map((d) => ({ d, min: sessions.filter((s) => s.date === d).reduce((a, s) => a + s.minutes, 0) }));
  const maxDay = Math.max(60, ...perDay.map((x) => x.min));
  const byCourse = courses.map((c) => ({ name: c.name, min: week.filter((s) => s.courseId === c.id).reduce((a, s) => a + s.minutes, 0) })).filter((x) => x.min > 0);
  const names = new Map(courses.map((c) => [c.id, c.name]));

  // Para repasar: temas con nivel 2 o menos en los cursos activos
  const weak = active.map((c) => ({ course: c.name, blocks: c.blocks.filter((b) => b.level <= 2) })).filter((x) => x.blocks.length);

  // Gastos de facultad
  const month = today.slice(0, 7);
  const spendMonth = spend.filter((s) => s.date.startsWith(month)).reduce((a, s) => a + s.amountCents, 0);
  const spendYear = spend.reduce((a, s) => a + s.amountCents, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Estudio" description="Tus ATI: temas, ritmo hasta el examen, fechas, pomodoro y errores.">
        <NewCourseButton canSave={canSave} />
      </PageHeader>
      {!canSave && <DemoNotice />}

      {courses.length === 0 && <TemplateLoader templates={STUDY_TEMPLATES.map(({ id, title, description }) => ({ id, title, description }))} canSave={canSave} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <EventsCard events={events} courses={courseOpts} today={today} canSave={canSave} />
          {courses.map((c) => {
            const examDate = nextExam(events, c.id, today);
            const exam = examDate ? (events.find((e) => e.courseId === c.id && e.kind === "examen" && e.date === examDate && !e.result) ?? null) : null;
            return <CourseCard key={c.id} course={c} pace={coursePace(c.blocks, today, examDate, c.reviewDays)} exam={exam} today={today} canSave={canSave} />;
          })}
          {weak.length > 0 && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Para repasar</CardTitle>
                  <CardDescription>Temas en nivel 2 o menos ({LEVEL_LABEL[2].toLowerCase()}). La última semana, solo estos.</CardDescription>
                </div>
              </CardHeader>
              <div className="space-y-3">
                {weak.map((w) => (
                  <div key={w.course}>
                    <p className="mb-1.5 text-xs font-medium text-ink-2">
                      {w.course} · {w.blocks.length}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {w.blocks.map((b) => (
                        <span key={b.id} className="max-w-full truncate rounded-full bg-surface-muted px-2.5 py-1 text-[11px] text-ink-2" title={`Nivel ${b.level}: ${LEVEL_LABEL[b.level]}`}>
                          {b.name} <span className="text-ink-3">· {b.level}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <Pomodoro courses={courseOpts} canSave={canSave} />
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Tiempo de estudio</CardTitle>
                <CardDescription>
                  Esta semana: <strong className="font-medium text-ink">{minutesLabel(weekMin)}</strong> · hoy {minutesLabel(todayMin)}
                </CardDescription>
              </div>
              {streak > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">
                  <Flame className="h-3 w-3" /> {streak} {streak === 1 ? "día" : "días"} seguidos
                </span>
              )}
            </CardHeader>
            <div className="flex h-24 items-end gap-1" aria-label="Minutos por día, últimas dos semanas">
              {perDay.map(({ d, min }) => (
                <div key={d} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${shortDate(d)}: ${minutesLabel(min)}`}>
                  <div className={`w-full rounded-t ${d === today ? "bg-accent" : "bg-accent/40"}`} style={{ height: `${min ? Math.max(4, (min / maxDay) * 100) : 0}%` }} />
                  <span className="text-[9px] text-ink-3">{shortDate(d).slice(0, 1)}</span>
                </div>
              ))}
            </div>
            {byCourse.length > 0 && (
              <ul className="mt-4 space-y-1 text-xs">
                {byCourse.map((c) => (
                  <li key={c.name} className="flex justify-between gap-3">
                    <span className="truncate text-ink-2">{c.name}</span>
                    <span className="num shrink-0">{minutesLabel(c.min)}</span>
                  </li>
                ))}
              </ul>
            )}
            {sessions.length > 0 && (
              <details className="mt-4 border-t border-border pt-3 text-xs">
                <summary className="cursor-pointer text-ink-3">Últimos registros</summary>
                <ul className="mt-2 divide-y divide-border">
                  {sessions.slice(0, 10).map((s) => (
                    <li key={s.id} className="flex items-center gap-2 py-1.5">
                      <span className="w-16 shrink-0 text-ink-3">{shortDate(s.date)}</span>
                      <span className="min-w-0 flex-1 truncate">{s.courseId ? (names.get(s.courseId) ?? "Curso borrado") : "General"}</span>
                      <span className="num">{minutesLabel(s.minutes)}</span>
                      {canSave && <SessionDelete id={s.id} />}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
          <MistakesCard mistakes={mistakes} courses={courses.map((c) => ({ id: c.id, name: c.name, blocks: c.blocks.map(({ id, name }) => ({ id, name })) }))} canSave={canSave} />
          <MoodleCard masked={settings?.moodleIcalUrl ? maskIcalUrl(settings.moodleIcalUrl) : null} sync={settings?.moodleSync ?? null} canSave={canSave} />
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Gastos de facultad</CardTitle>
                <CardDescription>
                  Lo que cargás con la categoría <strong className="font-medium">Facultad</strong>: apuntes, fotocopias, colectivo, materiales.
                </CardDescription>
              </div>
            </CardHeader>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] text-ink-3">Este mes</p>
                <p className="num font-semibold">{formatARS(spendMonth)}</p>
              </div>
              <div>
                <p className="text-[11px] text-ink-3">En {today.slice(0, 4)}</p>
                <p className="num font-semibold">{formatARS(spendYear)}</p>
              </div>
            </div>
            {spend.length > 0 && (
              <ul className="mt-3 divide-y divide-border text-xs">
                {spend.slice(0, 5).map((s, i) => (
                  <li key={i} className="flex justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate text-ink-2">
                      {shortDate(s.date)} · {s.description ?? "Gasto"}
                    </span>
                    <span className="num shrink-0">{formatARS(s.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/" className="mt-3 inline-block text-xs text-accent">
              Cargar un gasto →
            </Link>
          </Card>
          <PushToggle canSave={canSave} />
        </div>
      </div>
    </div>
  );
}
