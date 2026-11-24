"use client";

import { useMemo, useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { categoryLabel } from "@/lib/labels";
import {
  compareEstimateWithPayslip,
  estimateCommerceSalary,
  formatARS,
  formatPct,
  type CommerceCategory,
  type PayslipTotals,
  type ScaleEntry,
} from "@/lib/finance";

const CATEGORY_LABEL = categoryLabel;

export function SalaryEstimator({
  scales,
  today,
  lastPayslip,
  initial,
}: {
  scales: ScaleEntry[];
  today: string;
  lastPayslip?: PayslipTotals;
  initial?: { category: CommerceCategory; seniorityYears: number; weeklyHours: number };
}) {
  const categories = [...new Set(scales.map((s) => s.category))];
  const [category, setCategory] = useState<CommerceCategory>(initial?.category ?? categories[0] ?? "AUXILIAR_C");
  const [seniority, setSeniority] = useState(initial?.seniorityYears ?? 0);
  const [hours, setHours] = useState(initial?.weeklyHours ?? 48);
  const [presentismo, setPresentismo] = useState(true);
  const [date, setDate] = useState(today);

  const { estimate, error } = useMemo(() => {
    try {
      return { estimate: estimateCommerceSalary({ scales, category, date, seniorityYears: seniority, weeklyHours: hours, presentismo }), error: null };
    } catch (e) {
      return { estimate: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [scales, category, date, seniority, hours, presentismo]);

  const comparison = estimate && lastPayslip ? compareEstimateWithPayslip(estimate, lastPayslip) : null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Estimador de sueldo · Empleados de Comercio</CardTitle>
          <CardDescription>CCT 130/75. La escala se elige por vigencia según la fecha.</CardDescription>
        </div>
      </CardHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="Categoría" className="col-span-2 sm:col-span-1">
          <Select value={category} onChange={(e) => setCategory(e.target.value as CommerceCategory)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Período">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value || today)} />
        </Field>
        <Field label="Antigüedad (años)">
          <Input type="number" min={0} max={50} value={seniority} onChange={(e) => setSeniority(Math.max(0, Number(e.target.value)))} />
        </Field>
        <Field label="Horas semanales">
          <Input type="number" min={1} max={48} value={hours} onChange={(e) => setHours(Math.min(48, Math.max(1, Number(e.target.value))))} />
        </Field>
        <Field label="Presentismo">
          <Select value={presentismo ? "1" : "0"} onChange={(e) => setPresentismo(e.target.value === "1")}>
            <option value="1">Sí</option>
            <option value="0">No</option>
          </Select>
        </Field>
      </div>

      {scales.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface-muted p-3 text-sm text-ink-2">
          Cargá la escala vigente en <a href="/configuracion#escalas" className="font-medium text-ink underline">Configuración</a> para estimar el sueldo.
        </p>
      ) : (
        error && <p className="mt-4 rounded-xl bg-bad-soft p-3 text-sm text-bad">{error}</p>
      )}

      {estimate && (
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {estimate.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1.5 text-ink-2">
                      {l.label}
                      {l.type === "nonrem" && <span className="ml-1 text-[10px] text-ink-3">no rem.</span>}
                    </td>
                    <td className={`num py-1.5 text-right ${l.type === "deduction" ? "text-bad" : ""}`}>
                      {l.type === "deduction" ? "−" : ""}
                      {formatARS(l.amountCents, { decimals: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-ink-3">
              Escala vigente desde {estimate.scale.validFrom}
              {estimate.scale.source ? ` · ${estimate.scale.source}` : ""}
            </p>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl bg-surface-muted p-4">
              <p className="text-xs text-ink-3">Neto estimado</p>
              <p className="num text-3xl font-semibold tracking-tight">{formatARS(estimate.netCents)}</p>
              <p className="num mt-1 text-xs text-ink-2">
                Bruto {formatARS(estimate.grossCents)} · Descuentos {formatARS(estimate.deductionsCents)}
              </p>
            </div>
            {comparison && (
              <div>
                <p className="mb-2 text-xs font-medium text-ink-2">Estimado vs. último recibo ({lastPayslip!.period})</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-ink-3">
                      <th className="font-normal">Concepto</th>
                      <th className="text-right font-normal">Estimado</th>
                      <th className="text-right font-normal">Liquidado</th>
                      <th className="text-right font-normal">Dif.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {comparison.map((c) => (
                      <tr key={c.field}>
                        <td className="py-1.5 text-ink-2">{c.label}</td>
                        <td className="num py-1.5 text-right">{formatARS(c.estimatedCents)}</td>
                        <td className="num py-1.5 text-right">{formatARS(c.actualCents)}</td>
                        <td className="py-1.5 text-right">
                          {c.significant ? <Badge tone="warn">{c.diffPct === null ? formatARS(c.diffCents) : formatPct(c.diffPct)}</Badge> : <span className="text-xs text-ink-3">ok</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
