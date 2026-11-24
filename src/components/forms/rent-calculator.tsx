"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { send } from "@/lib/client-api";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MoneyInput, PctInput } from "./money-input";
import { addMonthsToDate, formatARS, formatPct, nextRentAdjustment, rentAdjustments, type IndexData, type RentContract } from "@/lib/finance";
import type { IndexType } from "@/types/finance";

const fmtDate = (d: string) => d.split("-").reverse().join("/");

export function RentCalculator({
  initial,
  indices,
  today,
  defaultInflation,
  canSave = false,
  saved = false,
}: {
  initial: RentContract & { dueDay?: number };
  indices: IndexData;
  today: string;
  defaultInflation: number;
  canSave?: boolean;
  saved?: boolean;
}) {
  const router = useRouter();
  const [c, setC] = useState<RentContract>(initial);
  const [dueDay, setDueDay] = useState(initial.dueDay ?? 10);
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    setStatus("Guardando…");
    const r = await send("/api/rent", "PUT", { ...c, label: "Alquiler", lagMonths: c.lagMonths ?? 1, dueDay });
    setStatus(r.ok ? "Contrato guardado." : r.error);
    if (r.ok) router.refresh();
  }
  const [inflation, setInflation] = useState(defaultInflation);
  const set = (patch: Partial<RentContract>) => setC((x) => ({ ...x, ...patch }));

  const { schedule, next } = useMemo(() => {
    const opts = { projectedMonthlyInflation: inflation };
    const end = addMonthsToDate(c.startDate, c.durationMonths ?? 36);
    return { schedule: rentAdjustments(c, indices, end, opts), next: nextRentAdjustment(c, indices, today, opts) };
  }, [c, indices, inflation, today]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Alquiler y próximo aumento</CardTitle>
          <CardDescription>ICL / IPC / acuerdo fijo. Si falta un índice se proyecta con tu inflación estimada.</CardDescription>
        </div>
        {canSave && (
          <div className="flex items-center gap-2">
            {status && <span className="text-xs text-ink-3">{status}</span>}
            <Button variant={saved ? "outline" : "accent"} size="sm" onClick={save} disabled={c.baseRentCents <= 0}>
              {saved ? "Actualizar contrato" : "Guardar contrato"}
            </Button>
          </div>
        )}
      </CardHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Field label="Inicio">
          <Input type="date" value={c.startDate} onChange={(e) => e.target.value && set({ startDate: e.target.value })} />
        </Field>
        <Field label="Alquiler inicial">
          <MoneyInput valueCents={c.baseRentCents} onChange={(v) => set({ baseRentCents: v })} />
        </Field>
        <Field label="Ajuste cada (meses)">
          <Input type="number" min={1} max={24} value={c.adjustmentIntervalMonths} onChange={(e) => set({ adjustmentIntervalMonths: Math.max(1, Number(e.target.value) || 1) })} />
        </Field>
        <Field label="Índice">
          <Select value={c.indexType} onChange={(e) => set({ indexType: e.target.value as IndexType })}>
            <option value="ICL">ICL (BCRA)</option>
            <option value="IPC">IPC (INDEC)</option>
            <option value="FIXED">Acuerdo fijo</option>
          </Select>
        </Field>
        {c.indexType === "FIXED" ? (
          <Field label="Aumento por ajuste">
            <PctInput value={c.fixedRate ?? 0} onChange={(v) => set({ fixedRate: v })} step={1} />
          </Field>
        ) : (
          <Field label="Duración (meses)">
            <Input type="number" min={1} value={c.durationMonths ?? 36} onChange={(e) => set({ durationMonths: Number(e.target.value) || 36 })} />
          </Field>
        )}
        <Field label="Vence el día">
          <Input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(Math.min(31, Math.max(1, Number(e.target.value) || 10)))} />
        </Field>
        <Field label="Inflación proyectada">
          <PctInput value={inflation} onChange={setInflation} />
        </Field>
      </div>

      {next && (
        <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-2 rounded-xl bg-surface-muted p-4">
          <div>
            <p className="text-xs text-ink-3">Próximo ajuste · {fmtDate(next.date)}</p>
            <p className="num text-3xl font-semibold tracking-tight">{formatARS(next.newCents)}</p>
          </div>
          <p className="num pb-1 text-sm text-ink-2">
            +{formatARS(next.increaseCents)} por mes ({formatPct(next.increasePct)}) {next.projected && <Badge tone="warn">proyectado</Badge>}
          </p>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-[11px] text-ink-3">
              <th className="py-1 font-normal">Fecha</th>
              <th className="py-1 text-right font-normal">Antes</th>
              <th className="py-1 text-right font-normal">Después</th>
              <th className="py-1 text-right font-normal">Aumento</th>
              <th className="py-1 pl-4 font-normal">Base</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {schedule.map((a) => (
              <tr key={a.date} className={a.date <= today ? "text-ink-3" : ""}>
                <td className="py-1.5">{fmtDate(a.date)}</td>
                <td className="num py-1.5 text-right">{formatARS(a.fromCents)}</td>
                <td className="num py-1.5 text-right font-medium">{formatARS(a.toCents)}</td>
                <td className="num py-1.5 text-right">{formatPct(a.increasePct)}</td>
                <td className="py-1.5 pl-4 text-xs text-ink-3">
                  {a.detail} {a.projected && <Badge tone="warn">proy.</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
