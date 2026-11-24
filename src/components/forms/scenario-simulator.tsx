"use client";

import { useMemo, useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MoneyInput, PctInput } from "./money-input";
import { monthLabel } from "@/lib/labels";
import { CashflowChart } from "@/components/charts/cashflow-chart";
import { addMonths, formatARS, simulate, type CashflowInput, type ScenarioOp } from "@/lib/finance";

/** "¿Qué pasa si…?" — simula sobre una copia, sin tocar los datos reales. */
export function ScenarioSimulator({ base, defaultInflation }: { base: CashflowInput; defaultInflation: number }) {
  const [purchase, setPurchase] = useState(0);
  const [count, setCount] = useState(6);
  const [inflation, setInflation] = useState(defaultInflation);
  const [incomeChange, setIncomeChange] = useState(0);
  const [extraGoal, setExtraGoal] = useState(0);

  const result = useMemo(() => {
    const ops: ScenarioOp[] = [];
    if (purchase > 0) ops.push({ type: "addPurchase", label: "Compra simulada", firstMonth: addMonths(base.startMonth, 1), count, totalCents: purchase });
    if (inflation !== defaultInflation) ops.push({ type: "setInflation", monthlyRate: inflation });
    if (incomeChange !== 0) ops.push({ type: "scaleIncome", factor: 1 + incomeChange });
    if (extraGoal > 0) ops.push({ type: "setGoalContribution", label: "Aporte extra", amountCents: extraGoal });
    return simulate(base, ops);
  }, [base, purchase, count, inflation, incomeChange, extraGoal, defaultInflation]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Simulador de escenarios</CardTitle>
          <CardDescription>Probá antes de decidir. No modifica tus datos.</CardDescription>
        </div>
      </CardHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="Compra nueva" className="col-span-2 sm:col-span-1">
          <MoneyInput valueCents={purchase} onChange={setPurchase} />
        </Field>
        <Field label="En cuotas">
          <Input type="number" min={1} max={24} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} />
        </Field>
        <Field label="Inflación mensual">
          <PctInput value={inflation} onChange={setInflation} step={0.5} />
        </Field>
        <Field label="Cambio de ingreso">
          <PctInput value={incomeChange} onChange={setIncomeChange} step={1} />
        </Field>
        <Field label="Aporte extra a ahorro">
          <MoneyInput valueCents={extraGoal} onChange={setExtraGoal} />
        </Field>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-ink-2">Saldo mínimo:</span>
        <span className="num font-medium">{formatARS(result.scenario.minClosingCents)}</span>
        <Badge tone={result.minBalanceDeltaCents < 0 ? "bad" : result.minBalanceDeltaCents > 0 ? "good" : "neutral"}>
          {result.minBalanceDeltaCents >= 0 ? "+" : ""}
          {formatARS(result.minBalanceDeltaCents)} vs. hoy
        </Badge>
        {result.newBottlenecks.length > 0 && <Badge tone="bad">Nuevos meses ajustados: {result.newBottlenecks.map(monthLabel).join(", ")}</Badge>}
      </div>
      <div className="mt-4">
        <CashflowChart
          height={240}
          data={result.scenario.months.map((m) => ({ month: m.month, ingresos: m.incomeCents, egresos: m.outflowCents, saldo: m.closingCents, bottleneck: m.bottleneck }))}
        />
      </div>
    </Card>
  );
}
