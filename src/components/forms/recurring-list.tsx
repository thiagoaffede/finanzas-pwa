"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BillEditor } from "./bills-list";
import { FREQUENCIES } from "./quick-expense";
import { send } from "@/lib/client-api";
import { formatARS } from "@/lib/finance/money";
import { dateLabel } from "@/lib/labels";
import type { BillView } from "@/lib/data/context";

export interface RecurringItem {
  bill: BillView;
  /** Próximo vencimiento (el de la boleta pendiente, o el que sigue al último pagado). */
  nextDue: string;
}

const freqLabel = (m: number) => FREQUENCIES.find((f) => f.months === m)?.label ?? `Cada ${m} meses`;

/** Gastos fijos y suscripciones: cuánto, cada cuánto y cuándo vence el próximo. */
export function RecurringList({ items, rentCents, canSave }: { items: RecurringItem[]; rentCents: number; canSave: boolean }) {
  const [editing, setEditing] = useState<BillView | null>(null);
  const monthly = items.reduce((s, i) => s + i.bill.amountCents / Math.max(1, i.bill.recurrenceMonths), 0) + rentCents;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Gastos fijos y suscripciones</CardTitle>
          <CardDescription>
            Equivalen a <span className="num font-medium text-ink">{formatARS(Math.round(monthly))}</span> por mes
            {rentCents ? " con el alquiler" : ""}. Al pagar uno se crea el próximo.
          </CardDescription>
        </div>
      </CardHeader>
      {items.length === 0 && !rentCents ? (
        <p className="text-sm text-ink-3">
          Todavía no hay gastos fijos. Cargalos en Movimientos con &quot;Se repite&quot; o desde &quot;Agregar vencimiento&quot;.
        </p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rentCents > 0 && (
            <li className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">Alquiler</p>
                <p className="text-[11px] text-ink-3">Todos los meses · se ajusta según el contrato</p>
              </div>
              <span className="num font-medium">{formatARS(rentCents)}</span>
            </li>
          )}
          {items.map(({ bill, nextDue }) => (
            <li key={bill.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{bill.label}</p>
                <p className="text-[11px] text-ink-3">
                  {freqLabel(bill.recurrenceMonths)} · {bill.category ?? "Servicios"} · próximo {dateLabel(nextDue)}
                </p>
              </div>
              {!bill.paid && <Badge tone="accent">Pendiente</Badge>}
              <span className="num font-medium">{formatARS(bill.amountCents)}</span>
              {canSave && (
                <Button variant="ghost" size="sm" aria-label={`Editar ${bill.label}`} onClick={() => setEditing(bill)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <BillEditor bill={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

const DAY_OPTIONS = [7, 5, 3, 2, 1, 0];

/** Con cuántos días de anticipación avisar de cada vencimiento. */
export function ReminderSettings({ initial, canSave }: { initial: number[]; canSave: boolean }) {
  const router = useRouter();
  const [days, setDays] = useState<number[]>(initial);
  const [state, setState] = useState<string | null>(null);

  async function toggle(d: number) {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => b - a);
    setDays(next);
    setState("Guardando…");
    const r = await send("/api/settings", "PUT", { reminderDays: next });
    setState(r.ok ? "Guardado" : r.error);
    if (r.ok) router.refresh();
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-ink-2">Avisarme de cada vencimiento (servicios, gastos fijos, alquiler y tarjeta):</p>
      <div className="flex flex-wrap gap-2">
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            disabled={!canSave}
            onClick={() => toggle(d)}
            className={`rounded-full border px-3 py-1.5 text-xs ${days.includes(d) ? "border-accent bg-accent-soft text-accent" : "border-border text-ink-2"}`}
          >
            {d === 0 ? "El mismo día" : d === 1 ? "1 día antes" : `${d} días antes`}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-3">Los avisos llegan a las 8 de la mañana a los dispositivos activados. {state}</p>
    </div>
  );
}
