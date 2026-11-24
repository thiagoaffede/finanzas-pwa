"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { MoneyInput } from "./money-input";
import { send } from "@/lib/client-api";

/** Alta de un objetivo de ahorro. */
export function NewGoalForm({ canSave }: { canSave: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [target, setTarget] = useState(0);
  const [monthly, setMonthly] = useState(0);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || target <= 0) return setError("Poné un nombre y un monto objetivo.");
    setBusy(true);
    setError(null);
    const r = await send("/api/goals", "POST", {
      name: name.trim(),
      targetCents: target,
      monthlyContributionCents: monthly || null,
      targetDate: date || null,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setName("");
    setTarget(0);
    setMonthly(0);
    setDate("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Nuevo objetivo</CardTitle>
          <CardDescription>Ej.: fondo de emergencia, vacaciones, una compra grande.</CardDescription>
        </div>
      </CardHeader>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Monto objetivo">
          {/* key: reinicia el texto del input después de guardar */}
          <MoneyInput key={`t${target === 0}`} valueCents={target} onChange={setTarget} />
        </Field>
        <Field label="Aporte mensual (opcional)">
          <MoneyInput key={`m${monthly === 0}`} valueCents={monthly} onChange={setMonthly} />
        </Field>
        <Field label="Fecha objetivo (opcional)">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={!canSave || busy}>
            <Plus className="h-4 w-4" /> Crear objetivo
          </Button>
          {!canSave && <span className="text-xs text-ink-3">Conectá la base de datos para guardar.</span>}
          {error && <span className="text-xs text-bad">{error}</span>}
        </div>
      </form>
    </Card>
  );
}

/** Sumar (o restar, con monto negativo) un aporte a un objetivo. */
export function GoalContribution({ goalId, canSave }: { goalId: string; canSave: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);

  if (!canSave) return null;

  async function add() {
    if (!amount) return;
    setBusy(true);
    setError(null);
    const r = await send(`/api/goals/${goalId}/contributions`, "POST", { amountCents: amount });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setAmount(0);
    setN((x) => x + 1);
    router.refresh();
  }

  return (
    <div className="mt-4 flex items-center gap-2">
      <div className="flex-1">
        <MoneyInput key={n} valueCents={0} onChange={setAmount} placeholder="Sumar aporte" />
      </div>
      <Button variant="outline" size="sm" disabled={busy || !amount} onClick={add}>
        Sumar
      </Button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  );
}

/** Editar o eliminar un objetivo. */
export function GoalEditor({
  goal,
  canSave,
}: {
  goal: { id: string; name: string; targetCents: number; monthlyContributionCents: number; targetDate: string | null };
  canSave: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(goal.targetCents);
  const [monthly, setMonthly] = useState(goal.monthlyContributionCents);
  const [date, setDate] = useState(goal.targetDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canSave) return null;
  if (!open) {
    return (
      <Button variant="ghost" size="sm" aria-label="Editar objetivo" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" /> Editar
      </Button>
    );
  }

  async function save() {
    if (!name.trim() || target <= 0) return setError("Poné un nombre y un monto objetivo.");
    setBusy(true);
    setError(null);
    const r = await send(`/api/goals/${goal.id}`, "PATCH", {
      name: name.trim(),
      targetCents: target,
      monthlyContributionCents: monthly || null,
      targetDate: date || null,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar "${goal.name}"? Lo ahorrado no se borra de tus cuentas.`)) return;
    setBusy(true);
    const r = await send(`/api/goals/${goal.id}`, "DELETE");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  return (
    <Dialog title="Editar objetivo" onClose={() => setOpen(false)}>
        <div className="grid gap-3">
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Monto objetivo">
            <MoneyInput valueCents={target} onChange={setTarget} />
          </Field>
          <Field label="Aporte mensual">
            <MoneyInput valueCents={monthly} onChange={setMonthly} />
          </Field>
          <Field label="Fecha objetivo (opcional)">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {error && <p className="mt-3 text-xs text-bad">{error}</p>}
        <div className="mt-5 flex items-center gap-2">
          <Button disabled={busy} onClick={save}>
            Guardar cambios
          </Button>
          <Button variant="ghost" disabled={busy} onClick={remove} className="ml-auto text-bad">
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </Button>
        </div>
    </Dialog>
  );
}
