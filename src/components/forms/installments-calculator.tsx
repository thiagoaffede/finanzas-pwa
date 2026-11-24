"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoneyInput, PctInput } from "./money-input";
import { compareCashVsInstallments, formatARS, formatPct, type InstallmentOption } from "@/lib/finance";
import { cn } from "@/lib/utils";

type Row = { id: number; count: number; mode: "surcharge" | "amount"; surchargeRate: number; installmentCents: number; offset: number };

export function InstallmentsCalculator({ defaultInflation = 0.025, defaultAltRate = 0.022 }: { defaultInflation?: number; defaultAltRate?: number }) {
  const [listPrice, setListPrice] = useState(60_000_000);
  const [cashDiscount, setCashDiscount] = useState(0.1);
  const [inflation, setInflation] = useState(defaultInflation);
  const [altRate, setAltRate] = useState(defaultAltRate);
  const [rows, setRows] = useState<Row[]>([
    { id: 1, count: 3, mode: "surcharge", surchargeRate: 0, installmentCents: 0, offset: 1 },
    { id: 2, count: 6, mode: "surcharge", surchargeRate: 0.12, installmentCents: 0, offset: 1 },
  ]);

  const results = useMemo(
    () =>
      rows.map((r) => {
        const option: InstallmentOption =
          r.mode === "amount" ? { count: r.count, installmentCents: r.installmentCents, firstPaymentOffsetMonths: r.offset } : { count: r.count, surchargeRate: r.surchargeRate, firstPaymentOffsetMonths: r.offset };
        try {
          return { row: r, result: compareCashVsInstallments({ listPriceCents: listPrice, cashDiscountRate: cashDiscount, option, monthlyInflation: inflation, monthlyAlternativeRate: altRate }) };
        } catch {
          return { row: r, result: null };
        }
      }),
    [rows, listPrice, cashDiscount, inflation, altRate],
  );
  const best = results.filter((r) => r.result).sort((a, b) => a.result!.presentValueCents - b.result!.presentValueCents)[0];
  const cashPrice = Math.round(listPrice * (1 - cashDiscount));
  const winner = best && best.result!.presentValueCents < cashPrice ? `${best.row.count} cuotas` : "Contado";

  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>Datos de la compra</CardTitle>
            <CardDescription>Usamos la tasa mayor entre inflación y rendimiento alternativo para traer las cuotas a pesos de hoy.</CardDescription>
          </div>
        </CardHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Precio de lista" className="col-span-2">
            <MoneyInput valueCents={listPrice} onChange={setListPrice} />
          </Field>
          <Field label="Descuento contado">
            <PctInput value={cashDiscount} onChange={setCashDiscount} step={1} />
          </Field>
          <Field label="Precio contado">
            <p className="num flex h-10 items-center text-sm font-medium">{formatARS(cashPrice)}</p>
          </Field>
          <Field label="Inflación mensual" hint="Tu estimación">
            <PctInput value={inflation} onChange={setInflation} />
          </Field>
          <Field label="Rendimiento mensual" hint="Plazo fijo, FCI, etc.">
            <PctInput value={altRate} onChange={setAltRate} />
          </Field>
        </div>
      </Card>

      <div className="space-y-4 lg:col-span-3">
        <Card className="bg-ink text-white">
          <p className="text-xs text-white/60">Conviene</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{winner}</p>
          {best?.result && <p className="mt-2 text-sm text-white/80">{best.result.summary}</p>}
        </Card>

        {results.map(({ row, result }) => (
          <Card key={row.id} className={cn(best?.row.id === row.id && winner !== "Contado" && "ring-2 ring-accent/40")}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Cuotas">
                <Input type="number" min={1} max={60} value={row.count} onChange={(e) => update(row.id, { count: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
              <Field label="Tipo">
                <Select value={row.mode} onChange={(e) => update(row.id, { mode: e.target.value as Row["mode"] })}>
                  <option value="surcharge">Recargo %</option>
                  <option value="amount">Monto cuota</option>
                </Select>
              </Field>
              <Field label={row.mode === "surcharge" ? "Recargo total" : "Valor cuota"}>
                {row.mode === "surcharge" ? (
                  <PctInput value={row.surchargeRate} onChange={(v) => update(row.id, { surchargeRate: v })} step={1} />
                ) : (
                  <MoneyInput valueCents={row.installmentCents} onChange={(v) => update(row.id, { installmentCents: v })} />
                )}
              </Field>
              <Field label="1ª cuota en">
                <Select value={row.offset} onChange={(e) => update(row.id, { offset: Number(e.target.value) })}>
                  <option value={0}>Hoy</option>
                  <option value={1}>1 mes</option>
                  <option value={2}>2 meses</option>
                </Select>
              </Field>
            </div>
            {result && (
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-3 text-sm">
                <span>
                  <span className="text-ink-3">Total nominal </span>
                  <span className="num font-medium">{formatARS(result.nominalTotalCents)}</span>
                </span>
                <span>
                  <span className="text-ink-3">En pesos de hoy </span>
                  <span className="num font-medium">{formatARS(result.presentValueCents)}</span>
                </span>
                <span>
                  <span className="text-ink-3">Cuota </span>
                  <span className="num font-medium">{formatARS(result.installments[0])}</span>
                </span>
                {result.impliedMonthlyRate !== null && (
                  <span className="text-ink-3">
                    Tasa implícita <span className="num text-ink">{formatPct(result.impliedMonthlyRate)} mensual</span>
                  </span>
                )}
                <Badge tone={result.best === "cuotas" ? "good" : result.best === "contado" ? "bad" : "neutral"} className="ml-auto">
                  {result.savingWithInstallmentsCents >= 0 ? "Ahorrás " : "Perdés "}
                  {formatARS(Math.abs(result.savingWithInstallmentsCents))}
                </Badge>
                <Button variant="ghost" size="icon" aria-label="Quitar opción" onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}>
                  <Trash2 className="h-4 w-4 text-ink-3" />
                </Button>
              </div>
            )}
          </Card>
        ))}
        <Button variant="outline" className="w-full" onClick={() => setRows((rs) => [...rs, { id: Date.now(), count: 12, mode: "surcharge", surchargeRate: 0, installmentCents: 0, offset: 1 }])}>
          <Plus className="h-4 w-4" /> Agregar opción
        </Button>
      </div>
    </div>
  );
}
