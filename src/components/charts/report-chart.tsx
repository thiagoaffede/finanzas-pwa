"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatARS } from "@/lib/finance/money";

export interface ReportPoint {
  month: string;
  ingresosReales: number;
  gastosReales: number;
  ingresos: number;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const label = (ym: string) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(2, 4)}`;
const compact = (cents: number) => new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);

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

/** Ingresos y gastos de cada mes llevados a pesos de hoy, y el ingreso nominal para comparar. */
export function ReportChart({ data, height = 260 }: { data: ReportPoint[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#ecebe7" />
          <XAxis dataKey="month" tickFormatter={label} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#8a8984" }} />
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#8a8984" }} width={44} />
          <Tooltip content={<TooltipBox />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#52514e" }} />
          <Line dataKey="ingresosReales" name="Ingresos (pesos de hoy)" stroke="var(--color-series-1)" strokeWidth={2} dot={{ r: 3 }} type="monotone" />
          <Line dataKey="gastosReales" name="Gastos (pesos de hoy)" stroke="var(--color-series-2)" strokeWidth={2} dot={{ r: 3 }} type="monotone" />
          <Line dataKey="ingresos" name="Ingresos (como entraron)" stroke="#8a8984" strokeDasharray="4 4" strokeWidth={1.5} dot={false} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
