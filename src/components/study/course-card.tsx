"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronDown, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { send } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { CoursePace } from "@/lib/study/pace";
import { BLOCK_STATUS_LABEL, LEVEL_LABEL, type BlockStatus, type StudyBlock, type StudyCourse } from "@/lib/study/types";
import type { ISODate } from "@/types/finance";
import { relativeDays, shortDate } from "./format";

const STATE_TONE = { terminado: "good", al_dia: "good", justo: "warn", atrasado: "bad", sin_fecha: "neutral" } as const;
const STATE_LABEL = { terminado: "Bloques listos", al_dia: "Al día", justo: "Justo", atrasado: "Atrasado", sin_fecha: "Sin examen" } as const;
const STATUS_TONE: Record<BlockStatus, "neutral" | "accent" | "good"> = { pendiente: "neutral", en_curso: "accent", aprobado: "good" };
const NEXT_STATUS: Record<BlockStatus, BlockStatus> = { pendiente: "en_curso", en_curso: "aprobado", aprobado: "pendiente" };

export function CourseCard({
  course,
  pace,
  exam,
  today,
  canSave,
}: {
  course: StudyCourse;
  pace: CoursePace;
  exam: { title: string; date: ISODate; time: string | null; place: string | null } | null;
  today: ISODate;
  canSave: boolean;
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(course.blocks);
  const [editing, setEditing] = useState<StudyBlock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  // Si la página trae datos nuevos, se descartan los cambios optimistas.
  const [seen, setSeen] = useState(course.blocks);
  if (seen !== course.blocks) {
    setSeen(course.blocks);
    setBlocks(course.blocks);
  }

  async function patch(b: StudyBlock, change: Partial<Pick<StudyBlock, "status" | "level">>) {
    if (!canSave) return;
    const prev = blocks;
    setBlocks((bs) => bs.map((x) => (x.id === b.id ? { ...x, ...change } : x)));
    setError(null);
    const r = await send(`/api/study/blocks/${b.id}`, "PATCH", change);
    if (!r.ok) {
      setBlocks(prev);
      return setError(r.error);
    }
    router.refresh();
  }

  async function plan() {
    if (blocks.some((b) => b.status !== "aprobado" && b.targetDate) && !window.confirm("¿Volver a repartir las fechas objetivo de los temas que faltan? Se pisan las que tenías.")) return;
    setPlanning(true);
    setError(null);
    const r = await send(`/api/study/courses/${course.id}/plan`, "POST");
    setPlanning(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  const groups: { name: string | null; blocks: StudyBlock[] }[] = [];
  for (const b of blocks) {
    const g = groups.at(-1);
    if (g && g.name === b.groupName) g.blocks.push(b);
    else groups.push({ name: b.groupName, blocks: [b] });
  }
  const approved = blocks.filter((b) => b.status === "aprobado").length;

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {course.name}
            <Badge tone={STATE_TONE[pace.state]}>{STATE_LABEL[pace.state]}</Badge>
            {course.status !== "cursando" && <Badge>{course.status === "aprobado" ? "Aprobado" : "Pausado"}</Badge>}
          </CardTitle>
          <CardDescription className="mt-1">{pace.message}</CardDescription>
        </div>
        <CourseEditor course={course} canSave={canSave} />
      </CardHeader>

      <div className="mb-1 flex items-center justify-between text-xs text-ink-2">
        <span>
          {approved} de {blocks.length} aprobados
        </span>
        <span className="num">{blocks.length ? Math.round((approved / blocks.length) * 100) : 0}%</span>
      </div>
      <Progress value={blocks.length ? approved / blocks.length : 0} tone={pace.state === "atrasado" ? "bad" : pace.state === "justo" ? "warn" : "good"} />

      {exam && (
        <p className="mt-3 flex items-center gap-2 text-xs text-ink-2">
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="min-w-0">
            {exam.title}: <strong className="font-medium text-ink">{shortDate(exam.date)}</strong> ({relativeDays(today, exam.date)})
            {exam.time && ` · ${exam.time}`}
            {exam.place && ` · ${exam.place}`}
          </span>
        </p>
      )}

      <div className="mt-4 space-y-2">
        {groups.map((g, gi) => {
          const done = g.blocks.every((b) => b.status === "aprobado");
          const rows = (
            <ul className="divide-y divide-border">
              {g.blocks.map((b) => (
                <BlockRow key={b.id} block={b} today={today} canSave={canSave} onPatch={(c) => patch(b, c)} onEdit={() => setEditing(b)} />
              ))}
            </ul>
          );
          if (!g.name) return <div key={gi}>{rows}</div>;
          const ok = g.blocks.filter((b) => b.status === "aprobado").length;
          return (
            <details key={gi} open={!done} className="group rounded-xl border border-border px-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 py-2.5 text-xs font-medium text-ink-2">
                <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                <span className="num text-ink-3">
                  {ok}/{g.blocks.length}
                </span>
              </summary>
              {rows}
            </details>
          );
        })}
      </div>

      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
      {canSave && (
        <div className="mt-4 flex flex-wrap gap-2">
          <AddBlock courseId={course.id} />
          <Button variant="ghost" size="sm" disabled={planning || pace.remaining === 0} onClick={plan} title="Reparte los temas que faltan entre hoy y el repaso antes del examen">
            <Wand2 className="h-3.5 w-3.5" /> {planning ? "Repartiendo…" : "Repartir fechas"}
          </Button>
        </div>
      )}
      {editing && <BlockEditor block={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function BlockRow({
  block: b,
  today,
  canSave,
  onPatch,
  onEdit,
}: {
  block: StudyBlock;
  today: ISODate;
  canSave: boolean;
  onPatch: (c: Partial<Pick<StudyBlock, "status" | "level">>) => void;
  onEdit: () => void;
}) {
  const late = b.status !== "aprobado" && b.targetDate && b.targetDate < today;
  return (
    <li className="flex items-center gap-2 py-2.5">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={canSave ? onEdit : undefined} disabled={!canSave}>
        <p className={cn("truncate text-sm", b.status === "aprobado" && "text-ink-3 line-through decoration-ink-3/40")}>{b.name}</p>
        <p className="truncate text-[11px] text-ink-3">
          {b.targetDate && <span className={cn(late && "font-medium text-bad")}>{b.status === "aprobado" ? `Aprobado ${b.completedOn ? shortDate(b.completedOn) : ""}` : `Para el ${shortDate(b.targetDate)}`}</span>}
          {b.targetDate && b.detail && " · "}
          {b.detail}
        </p>
      </button>
      <LevelDots level={b.level} disabled={!canSave} onChange={(level) => onPatch({ level })} />
      <button
        type="button"
        disabled={!canSave}
        onClick={() => onPatch({ status: NEXT_STATUS[b.status] })}
        className="shrink-0 disabled:cursor-default"
        title="Tocá para cambiar: pendiente → en curso → aprobado"
      >
        <Badge tone={STATUS_TONE[b.status]} className="w-[4.75rem] justify-center">
          {BLOCK_STATUS_LABEL[b.status]}
        </Badge>
      </button>
    </li>
  );
}

/** Los 4 niveles de dominio: leído, con el material, a ciegas, lo explico. */
function LevelDots({ level, disabled, onChange }: { level: number; disabled: boolean; onChange: (l: number) => void }) {
  return (
    <div className="flex shrink-0 items-center" role="group" aria-label={`Nivel ${level}: ${LEVEL_LABEL[level]}`} title={`Nivel ${level}: ${LEVEL_LABEL[level]}`}>
      {[1, 2, 3, 4].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          aria-label={`Nivel ${n}: ${LEVEL_LABEL[n]}`}
          onClick={() => onChange(level === n ? n - 1 : n)}
          className="flex h-7 w-4 items-center justify-center disabled:cursor-default"
        >
          <span className={cn("h-2 w-2 rounded-full border", n <= level ? (level === 4 ? "border-good bg-good" : "border-accent bg-accent") : "border-ink-3/50")} />
        </button>
      ))}
    </div>
  );
}

function AddBlock({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setError("Poné un nombre.");
    setBusy(true);
    setError(null);
    const r = await send("/api/study/blocks", "POST", { courseId, name: name.trim(), targetDate: date || null });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    setName("");
    setDate("");
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Tema
      </Button>
      {open && (
        <Dialog title="Agregar tema o bloque" onClose={() => setOpen(false)}>
          <div className="grid gap-3">
            <Field label="Nombre">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Para cuándo (opcional)">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          {error && <p className="mt-3 text-xs text-bad">{error}</p>}
          <Button className="mt-5" disabled={busy} onClick={save}>
            Agregar
          </Button>
        </Dialog>
      )}
    </>
  );
}

function BlockEditor({ block, onClose }: { block: StudyBlock; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(block.name);
  const [detail, setDetail] = useState(block.detail ?? "");
  const [date, setDate] = useState(block.targetDate ?? "");
  const [status, setStatus] = useState<BlockStatus>(block.status);
  const [level, setLevel] = useState(block.level);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setError("Poné un nombre.");
    setBusy(true);
    setError(null);
    const r = await send(`/api/study/blocks/${block.id}`, "PATCH", {
      name: name.trim(),
      detail: detail.trim() || null,
      targetDate: date || null,
      level,
      ...(status !== block.status ? { status } : {}),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`¿Borrar "${block.name}"?`)) return;
    setBusy(true);
    const r = await send(`/api/study/blocks/${block.id}`, "DELETE");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  return (
    <Dialog title="Editar tema" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Detalle" hint="Páginas, test asociado o lo que tenés que poder hacer.">
          <Input value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={300} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estado">
            <Select value={status} onChange={(e) => setStatus(e.target.value as BlockStatus)}>
              {Object.entries(BLOCK_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Para cuándo">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Nivel de dominio">
          <Select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
            {LEVEL_LABEL.map((l, i) => (
              <option key={i} value={i}>
                {i} · {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
      <div className="mt-5 flex items-center gap-2">
        <Button disabled={busy} onClick={save}>
          Guardar
        </Button>
        <Button variant="ghost" disabled={busy} onClick={remove} className="ml-auto text-bad">
          <Trash2 className="h-3.5 w-3.5" /> Borrar
        </Button>
      </div>
    </Dialog>
  );
}

function CourseEditor({ course, canSave }: { course: StudyCourse; canSave: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(course.name);
  const [status, setStatus] = useState(course.status);
  const [moodleName, setMoodleName] = useState(course.moodleName ?? "");
  const [reviewDays, setReviewDays] = useState(String(course.reviewDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canSave) return null;

  async function save() {
    if (!name.trim()) return setError("Poné un nombre.");
    setBusy(true);
    setError(null);
    const r = await send(`/api/study/courses/${course.id}`, "PATCH", {
      name: name.trim(),
      status,
      moodleName: moodleName.trim() || null,
      reviewDays: Math.max(0, Math.min(30, Number(reviewDays) || 0)),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`¿Borrar "${course.name}" con sus temas y su planilla de errores? El tiempo de estudio queda registrado.`)) return;
    setBusy(true);
    const r = await send(`/api/study/courses/${course.id}`, "DELETE");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="sm" aria-label="Editar curso" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <Dialog title="Editar curso" onClose={() => setOpen(false)}>
          <div className="grid gap-3">
            <Field label="Nombre">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Estado">
              <Select value={status} onChange={(e) => setStatus(e.target.value as StudyCourse["status"])}>
                <option value="cursando">Cursando</option>
                <option value="aprobado">Aprobado</option>
                <option value="pausado">Pausado</option>
              </Select>
            </Field>
            <Field label="Días de repaso antes del examen" hint="Al repartir fechas, esos días quedan libres para repasar.">
              <Input type="number" inputMode="numeric" min={0} max={30} value={reviewDays} onChange={(e) => setReviewDays(e.target.value)} />
            </Field>
            <Field label="Nombre en Moodle (opcional)" hint="Si el calendario de Moodle lo llama distinto, poné acá cómo aparece.">
              <Input value={moodleName} onChange={(e) => setMoodleName(e.target.value)} maxLength={120} />
            </Field>
          </div>
          {error && <p className="mt-3 text-xs text-bad">{error}</p>}
          <div className="mt-5 flex items-center gap-2">
            <Button disabled={busy} onClick={save}>
              Guardar
            </Button>
            <Button variant="ghost" disabled={busy} onClick={remove} className="ml-auto text-bad">
              <Trash2 className="h-3.5 w-3.5" /> Borrar curso
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
