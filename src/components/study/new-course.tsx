"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { send } from "@/lib/client-api";

/** Alta de un curso a mano: nombre, cantidad de bloques y fecha del examen. */
export function NewCourseButton({ canSave }: { canSave: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [blocks, setBlocks] = useState("4");
  const [exam, setExam] = useState("");
  const [moodleName, setMoodleName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canSave) return null;

  async function save() {
    if (!name.trim()) return setError("Poné el nombre del curso.");
    setBusy(true);
    setError(null);
    const r = await send("/api/study/courses", "POST", {
      name: name.trim(),
      blocks: Math.max(0, Math.min(40, Number(blocks) || 0)),
      examDate: exam || null,
      moodleName: moodleName.trim() || null,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    setName("");
    setExam("");
    setMoodleName("");
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Nuevo curso
      </Button>
      {open && (
        <Dialog title="Nuevo curso" onClose={() => setOpen(false)}>
          <div className="grid gap-3">
            <Field label="Nombre">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ej.: Química" />
            </Field>
            <Field label="Cantidad de bloques" hint="Se crean como Bloque 1, Bloque 2… y después les podés cambiar el nombre.">
              <Input type="number" inputMode="numeric" min={0} max={40} value={blocks} onChange={(e) => setBlocks(e.target.value)} />
            </Field>
            <Field label="Fecha del examen (opcional)">
              <Input type="date" value={exam} onChange={(e) => setExam(e.target.value)} />
            </Field>
            <Field label="Nombre en Moodle (opcional)" hint="Para asociar las fechas que vienen del calendario de Moodle.">
              <Input value={moodleName} onChange={(e) => setMoodleName(e.target.value)} maxLength={120} />
            </Field>
          </div>
          {error && <p className="mt-3 text-xs text-bad">{error}</p>}
          <Button className="mt-5" disabled={busy} onClick={save}>
            Crear curso
          </Button>
        </Dialog>
      )}
    </>
  );
}
