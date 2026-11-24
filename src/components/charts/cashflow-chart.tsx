"use client";

import { Bar, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, ComposedChart } from "recharts";
import { formatARS } from "@/lib/finance/money";

export interface CashflowPoint {
  month: string;
  ingresos: number;
  egresos: number;
  saldo: number;
  bottleneck: boolean;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const label = (ym: string) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(2, 4)}`;
const compact = (cents: number) =>
  new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);

function TooltipBox({ active, payload, label: l }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-ink">{l ? label(l) : ""}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="num font-medium text-ink">{formatARS(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** Ingresos vs egresos por mes (barras) y saldo proyectado (línea). Una sola escala en pesos. */
export function CashflowChart({ data, height = 260 }: { data: CashflowPoint[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="#ecebe7" />
          <XAxis dataKey="month" tickFormatter={label} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#8a8984" }} />
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#8a8984" }} width={44} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "#f1f1ee" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#52514e" }} />
          <Bar dataKey="ingresos" name="Ingresos" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="egresos" name="Egresos" fill="var(--color-series-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Line dataKey="saldo" name="Saldo al cierre" stroke="#141413" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

