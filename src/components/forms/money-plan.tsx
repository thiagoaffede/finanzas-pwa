"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { PctInput } from "./money-input";
import { send } from "@/lib/client-api";
import { formatARS } from "@/lib/finance/money";
import { isNeed, type PlanSplit } from "@/lib/finance/money-plan";

/** Cambiar los porcentajes del reparto (55/25/20 por defecto). */
export function SplitEditor({ split, canSave }: { split: PlanSplit; canSave: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(split);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = v.needs + v.wants + v.savings;
  const okTotal = Math.abs(total - 1) < 0.011;

  async function save(value: PlanSplit | null) {
    setBusy(true);
    setError(null);
    const r = await send("/api/settings", "PUT", { planSplit: value });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    router.refresh();
  }

  if (!canSave) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" /> Cambiar %
      </Button>
      {open && (
        <Dialog title="Reparto del sueldo" onClose={() => setOpen(false)}>
          <p className="mb-4 text-xs text-ink-3">Los tres tienen que sumar 100 %. Lo recomendado es 55 / 25 / 20; si el alquiler pesa mucho, bajá los gastos libres antes que el ahorro.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Necesarios">
              <PctInput value={v.needs} step={1} onChange={(needs) => setV((x) => ({ ...x, needs }))} />
            </Field>
            <Field label="Libres">
              <PctInput value={v.wants} step={1} onChange={(wants) => setV((x) => ({ ...x, wants }))} />
            </Field>
            <Field label="Ahorro">
              <PctInput value={v.savings} step={1} onChange={(savings) => setV((x) => ({ ...x, savings }))} />
            </Field>
          </div>
          <p className={`mt-3 text-sm ${okTotal ? "text-ink-2" : "text-bad"}`}>Suman {Math.round(total * 100)} %</p>
          {error && <p className="mt-2 text-xs text-bad">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy || !okTotal} onClick={() => save(v)}>
              Guardar
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => save(null)}>
              Volver a 55 / 25 / 20
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

/** Presupuesto sugerido por categoría, comparado con los topes actuales, y botón para aplicarlo. */
export function SuggestedBudgets({
  suggested,
  current,
  canSave,
}: {
  suggested: Record<string, number>;
  current: Record<string, number>;
  canSave: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const rows = Object.entries(suggested);
  const need = rows.filter(([c]) => isNeed(c));
  const want = rows.filter(([c]) => !isNeed(c));
  const same = rows.every(([c, v]) => v === 0 || current[c] === v);

  async function apply() {
    setBusy(true);
    // Se mantienen los topes de categorías que el plan no toca (las que agregaste vos) y los que el plan deja en 0.
    const budgets = Object.fromEntries(Object.entries({ ...current, ...Object.fromEntries(Object.entries(suggested).filter(([, v]) => v > 0)) }).filter(([, v]) => v > 0));
    const r = await send("/api/settings", "PUT", { budgets });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: "Listo: el presupuesto quedó con estos topes." });
    router.refresh();
  }

  const table = (title: string, list: [string, number][]) => (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-2">{title}</p>
      <ul className="divide-y divide-border text-sm">
        {list.map(([c, v]) => (
          <li key={c} className="flex items-baseline justify-between gap-2 py-1.5">
            <span>{c}</span>
            <span className="num">
              {formatARS(v)}
              {current[c] !== undefined && current[c] !== v && <span className="ml-2 text-[11px] text-ink-3">hoy {formatARS(current[c])}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Presupuesto sugerido</CardTitle>
          <CardDescription>
            A los necesarios ya les descontamos alquiler, servicios y cuotas; esto es lo que queda para el resto. Al aplicarlo, la app te avisa al llegar al 80 % de cada tope.
          </CardDescription>
        </div>
      </CardHeader>
      <div className="grid gap-5 sm:grid-cols-2">
        {table("Necesarios", need)}
        {table("Libres", want)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={!canSave || busy || same} onClick={apply}>
          {same ? (
            <>
              <Check className="h-4 w-4" /> Ya lo estás usando
            </>
          ) : (
            "Usar este presupuesto"
          )}
        </Button>
        {msg && <span className={`text-xs ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</span>}
      </div>
    </Card>
  );
}

/** Crea el objetivo "Fondo de emergencia" con la meta y el aporte sugeridos. */
export function CreateEmergencyGoal({ targetCents, monthlyCents, canSave }: { targetCents: number; monthlyCents: number; canSave: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    setBusy(true);
    const r = await send("/api/goals", "POST", { name: "Fondo de emergencia", targetCents, monthlyContributionCents: monthlyCents, currency: "ARS" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={!canSave || busy || targetCents <= 0} onClick={create}>
        <ShieldCheck className="h-4 w-4" /> Crear el objetivo
      </Button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  );
}
