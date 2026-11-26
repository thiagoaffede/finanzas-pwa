"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MapPin, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { send } from "@/lib/client-api";
import { diffDays } from "@/lib/finance/dates";
import { EVENT_KIND_LABEL, EVENT_KINDS, type EventKind, type ExamResult, type StudyEvent } from "@/lib/study/types";
import type { ISODate } from "@/types/finance";
import { relativeDays, shortDate } from "./format";

const KIND_TONE: Record<EventKind, "bad" | "accent" | "warn" | "neutral" | "good"> = {
  examen: "bad",
  tramite: "warn",
  entrega: "warn",
  autoevaluacion: "accent",
  consulta: "good",
  otro: "neutral",
};

const RESULT_LABEL: Record<ExamResult, string> = { aprobado: "Aprobado", desaprobado: "Desaprobado", ausente: "Ausente" };

type CourseOpt = { id: string; name: string };

/** Próximas fechas: examen, trámites, consultas, autoevaluaciones. Y los exámenes pasados sin resultado. */
export function EventsCard({ events, courses, today, canSave }: { events: StudyEvent[]; courses: CourseOpt[]; today: ISODate; canSave: boolean }) {
  const [editing, setEditing] = useState<StudyEvent | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const names = new Map(courses.map((c) => [c.id, c.name]));

  const pendingResult = events.filter((e) => e.kind === "examen" && !e.result && e.date < today);
  const upcoming = events.filter((e) => (e.endDate ?? e.date) >= today).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  const shown = showAll ? upcoming : upcoming.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Próximas fechas</CardTitle>
          <CardDescription>{upcoming.length ? "Te avisamos al celular a medida que se acercan." : "No hay fechas cargadas para adelante."}</CardDescription>
        </div>
        {canSave && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Fecha
          </Button>
        )}
      </CardHeader>

      {pendingResult.length > 0 && (
        <div className="mb-3 space-y-2">
          {pendingResult.map((e) => (
            <ResultPrompt key={e.id} event={e} canSave={canSave} />
          ))}
        </div>
      )}

      <ul className="divide-y divide-border">
        {shown.map((e) => {
          const ongoing = e.date < today;
          const d = diffDays(today, e.date);
          const course = e.courseId ? names.get(e.courseId) : null;
          return (
            <li key={e.id}>
              <button type="button" className="flex w-full items-start gap-3 py-2.5 text-left disabled:cursor-default" disabled={!canSave} onClick={() => setEditing(e)}>
                <div className="w-14 shrink-0 text-center">
                  <p className="text-[11px] uppercase text-ink-3">{shortDate(e.date).split(" ")[0]}</p>
                  <p className="num text-sm font-semibold">{shortDate(e.date).split(" ")[1]}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{e.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
                    <Badge tone={KIND_TONE[e.kind]}>{EVENT_KIND_LABEL[e.kind]}</Badge>
                    {course && !e.title.includes(course) && <span>{course}</span>}
                    {e.time && <span>{e.time} h</span>}
                    {e.endDate && <span>hasta el {shortDate(e.endDate)}</span>}
                    {e.place && (
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />
                        {e.place}
                      </span>
                    )}
                    {e.source === "moodle" && <span>Moodle</span>}
                  </p>
                </div>
                <span className={`shrink-0 text-[11px] ${d <= 1 && !ongoing ? "font-medium text-bad" : "text-ink-3"}`}>{ongoing ? "en curso" : relativeDays(today, e.date)}</span>
              </button>
              {e.link && (
                <a href={e.link} target="_blank" rel="noreferrer" className="-mt-1 mb-2 ml-[4.25rem] inline-flex items-center gap-1 text-[11px] text-accent">
                  <ExternalLink className="h-3 w-3" /> Abrir link
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {upcoming.length > shown.length && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(true)}>
          Ver las {upcoming.length} fechas
        </Button>
      )}
      {editing && <EventEditor event={editing} courses={courses} onClose={() => setEditing(null)} />}
      {adding && <EventEditor courses={courses} onClose={() => setAdding(false)} />}
    </Card>
  );
}

function ResultPrompt({ event, canSave }: { event: StudyEvent; canSave: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!canSave) return null;
  async function set(result: ExamResult) {
    setBusy(true);
    await send(`/api/study/events/${event.id}`, "PATCH", { result });
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-3 text-xs">
      <p className="mb-2">
        ¿Cómo te fue en <strong className="font-medium">{event.title}</strong> ({shortDate(event.date)})?
      </p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(RESULT_LABEL) as ExamResult[]).map((r) => (
          <Button key={r} size="sm" variant={r === "aprobado" ? "default" : "outline"} disabled={busy} onClick={() => set(r)}>
            {RESULT_LABEL[r]}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-ink-3">Si no salió, cargá la próxima fecha con “+ Fecha”.</p>
    </div>
  );
}

function EventEditor({ event, courses, onClose }: { event?: StudyEvent; courses: CourseOpt[]; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "examen");
  const [title, setTitle] = useState(event?.title ?? "");
  const [courseId, setCourseId] = useState(event?.courseId ?? "");
  const [date, setDate] = useState(event?.date ?? "");
  const [endDate, setEndDate] = useState(event?.endDate ?? "");
  const [time, setTime] = useState(event?.time ?? "");
  const [place, setPlace] = useState(event?.place ?? "");
  const [link, setLink] = useState(event?.link ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [result, setResult] = useState<ExamResult | "">(event?.result ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const t = title.trim() || (kind === "examen" && courseId ? `Examen ${courses.find((c) => c.id === courseId)?.name ?? ""}`.trim() : "");
    if (!t || !date) return setError("Poné un título y una fecha.");
    if (link && !/^https?:\/\//i.test(link.trim())) return setError("El link tiene que empezar con https://");
    setBusy(true);
    setError(null);
    const body = {
      kind,
      title: t,
      courseId: courseId || null,
      date,
      endDate: endDate || null,
      time: time || null,
      place: place.trim() || null,
      link: link.trim() || null,
      notes: notes.trim() || null,
      ...(event ? { result: kind === "examen" && result ? result : null } : {}),
    };
    const r = event ? await send(`/api/study/events/${event.id}`, "PATCH", body) : await send("/api/study/events", "POST", body);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!event || !window.confirm(`¿Borrar "${event.title}"?`)) return;
    setBusy(true);
    const r = await send(`/api/study/events/${event.id}`, "DELETE");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  return (
    <Dialog title={event ? "Editar fecha" : "Nueva fecha"} onClose={onClose}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {EVENT_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Curso">
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">General</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder={kind === "examen" ? "Examen ATI Matemática" : ""} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Hora (opcional)">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Hasta (si dura varios días)">
          <Input type="date" value={endDate} min={date || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field label="Lugar o aula (opcional)">
          <Input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={160} />
        </Field>
        <Field label="Link (opcional)" hint="Videoconferencia, formulario de inscripción, etc.">
          <Input type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} maxLength={500} placeholder="https://" />
        </Field>
        <Field label="Notas (opcional)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>
        {event && kind === "examen" && (
          <Field label="Resultado">
            <Select value={result} onChange={(e) => setResult(e.target.value as ExamResult | "")}>
              <option value="">Todavía no</option>
              {(Object.keys(RESULT_LABEL) as ExamResult[]).map((r) => (
                <option key={r} value={r}>
                  {RESULT_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {event?.source === "moodle" && <p className="text-[11px] text-ink-3">Viene de Moodle: si cambia allá, se actualizan el título y la fecha.</p>}
      </div>
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
      <div className="mt-5 flex items-center gap-2">
        <Button disabled={busy} onClick={save}>
          {event ? "Guardar" : "Agregar"}
        </Button>
        {event && (
          <Button variant="ghost" disabled={busy} onClick={remove} className="ml-auto text-bad">
            <Trash2 className="h-3.5 w-3.5" /> Borrar
          </Button>
        )}
      </div>
    </Dialog>
  );
}
