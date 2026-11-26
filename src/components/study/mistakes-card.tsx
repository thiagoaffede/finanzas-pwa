"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { send } from "@/lib/client-api";
import { todayAR } from "@/lib/finance/dates";
import type { StudyMistake } from "@/lib/study/types";
import { shortDate } from "./format";

type CourseOpt = { id: string; name: string; blocks: { id: string; name: string }[] };

/**
 * Planilla de errores: cada ejercicio que salió mal, con el error exacto. Se marca cuando
 * lo rehiciste a ciegas. Dos semanas antes del examen, esto es el repaso.
 */
export function MistakesCard({ mistakes, courses, canSave }: { mistakes: StudyMistake[]; courses: CourseOpt[]; canSave: boolean }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [blockId, setBlockId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFixed, setShowFixed] = useState(false);
  const course = courses.find((c) => c.id === courseId);
  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const blockName = new Map(courses.flatMap((c) => c.blocks.map((b) => [b.id, b.name] as const)));
  const pending = mistakes.filter((m) => !m.fixed);
  const fixed = mistakes.filter((m) => m.fixed);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    const r = await send("/api/study/mistakes", "POST", { courseId: courseId || null, blockId: blockId || null, date: todayAR(), description: text.trim() });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setText("");
    router.refresh();
  }

  async function toggle(m: StudyMistake) {
    const r = await send(`/api/study/mistakes/${m.id}`, "PATCH", { fixed: !m.fixed });
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  async function remove(m: StudyMistake) {
    if (!window.confirm("¿Borrar este error de la planilla?")) return;
    const r = await send(`/api/study/mistakes/${m.id}`, "DELETE");
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  const row = (m: StudyMistake) => (
    <li key={m.id} className="flex items-start gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className={m.fixed ? "text-sm text-ink-3 line-through decoration-ink-3/40" : "text-sm"}>{m.description}</p>
        <p className="text-[11px] text-ink-3">
          {shortDate(m.date)}
          {m.courseId && ` · ${courseName.get(m.courseId) ?? ""}`}
          {m.blockId && blockName.get(m.blockId) && ` · ${blockName.get(m.blockId)}`}
        </p>
      </div>
      {canSave && (
        <>
          <Button variant="ghost" size="sm" onClick={() => toggle(m)} title={m.fixed ? "Volver a pendiente" : "Lo rehice a ciegas y salió"}>
            {m.fixed ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {m.fixed ? "" : "Lo rehice"}
          </Button>
          <Button variant="ghost" size="sm" aria-label="Borrar" onClick={() => remove(m)}>
            <Trash2 className="h-3.5 w-3.5 text-ink-3" />
          </Button>
        </>
      )}
    </li>
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Planilla de errores</CardTitle>
          <CardDescription>
            {pending.length ? `${pending.length} para rehacer a ciegas.` : "Anotá cada ejercicio que salió mal y por qué."} {fixed.length > 0 && `${fixed.length} ya resueltos.`}
          </CardDescription>
        </div>
      </CardHeader>
      {canSave && (
        <form onSubmit={add} className="mb-3 grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Curso">
              <Select
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setBlockId("");
                }}
              >
                <option value="">General</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tema (opcional)">
              <Select value={blockId} onChange={(e) => setBlockId(e.target.value)}>
                <option value="">—</option>
                {course?.blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Ej.: distribuí mal el signo en (−2)²" />
            <Button type="submit" size="icon" aria-label="Agregar error" disabled={busy || !text.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </form>
      )}
      {error && <p className="mb-2 text-xs text-bad">{error}</p>}
      {pending.length > 0 && <ul className="divide-y divide-border">{pending.map(row)}</ul>}
      {fixed.length > 0 && (
        <>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowFixed((v) => !v)}>
            {showFixed ? "Ocultar los resueltos" : `Ver los ${fixed.length} resueltos`}
          </Button>
          {showFixed && <ul className="divide-y divide-border">{fixed.map(row)}</ul>}
        </>
      )}
    </Card>
  );
}
