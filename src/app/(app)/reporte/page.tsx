import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DemoNotice } from "@/components/dashboard/demo-notice";
import { ReportChart } from "@/components/charts/report-chart";
import { loadFinanceContext } from "@/lib/data/context";
import { listTransactions } from "@/lib/data/repository";
import { getDb, hasDatabase } from "@/lib/db";
import { addMonths, buildMonthlyReport, formatARS, formatPct, lastDayOfMonth, monthOf, todayAR, type ReportTx } from "@/lib/finance";
import { monthLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Reporte mensual" };
export const dynamic = "force-dynamic";

function Change({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-ink-3">—</span>;
  const good = invert ? value <= 0 : value >= 0;
  return (
    <span className={`num ${good ? "text-good" : "text-bad"}`}>
      {value > 0 ? "+" : ""}
      {formatPct(value, 1)}
    </span>
  );
}

export default async function ReportePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await loadFinanceContext(todayAR());
  const { mes } = await searchParams;
  const month = mes && /^\d{4}-\d{2}$/.test(mes) && mes <= ctx.month ? mes : ctx.month;

  let txs: ReportTx[];
  if (hasDatabase()) {
    const rows = await listTransactions(getDb(), { from: `${addMonths(month, -11)}-01`, to: lastDayOfMonth(month), limit: 20_000 });
    txs = rows.map((t) => ({ date: t.date, amountCents: t.amountCents, isIncome: t.isIncome, category: t.category, owedCents: t.owedCents }));
  } else {
    txs = ctx.movements.map((t) => ({ date: t.date, amountCents: t.amountCents, isIncome: Boolean(t.isIncome), category: t.category, owedCents: t.owedCents }));
  }
  const ipc = new Map((ctx.indices.ipc ?? []).map((p) => [p.month, p.rate]));
  const r = buildMonthlyReport(month, txs, ipc, ctx.settings.monthlyInflation);
  const c = r.current;
  const factor = new Map(r.months.map((m) => [m.month, m.incomeCents ? m.realIncomeCents / m.incomeCents : null]));
  const salaries = ctx.salaryHistory.filter((s) => monthOf(s.date) <= month).slice(0, 12);
  const hasData = r.months.some((m) => m.incomeCents || m.expenseCents);
  // Desde el primer mes con datos: no tiene sentido mostrar meses vacíos de antes de empezar a usar la app.
  const first = r.months.findIndex((m) => m.incomeCents || m.expenseCents);
  const shown = first < 0 ? r.months.slice(-1) : r.months.slice(first);

  return (
    <div className="space-y-6">
      <PageHeader title="Reporte mensual" description="Ingresos, gastos y ahorro del mes, comparados con el anterior y con la inflación.">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Mes anterior">
            <Link href={`/reporte?mes=${addMonths(month, -1)}`}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <span className="min-w-24 text-center text-sm font-medium capitalize">{monthLabel(month)}</span>
          <Button asChild variant="ghost" size="icon" aria-label="Mes siguiente" disabled={month >= ctx.month}>
            <Link href={`/reporte?mes=${addMonths(month, 1)}`} aria-disabled={month >= ctx.month} className={month >= ctx.month ? "pointer-events-none opacity-30" : ""}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </PageHeader>
      {ctx.demo && <DemoNotice />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-ink-3">Ingresos</p>
          <p className="num text-xl font-semibold">{formatARS(c.incomeCents)}</p>
          <p className="text-xs text-ink-3">
            vs. mes anterior <Change value={r.incomeChange} /> · real <Change value={r.incomeRealChange} />
          </p>
        </Card>
        <Card>
          <p className="text-xs text-ink-3">Gastos</p>
          <p className="num text-xl font-semibold">{formatARS(c.expenseCents)}</p>
          <p className="text-xs text-ink-3">
            vs. mes anterior <Change value={r.expenseChange} invert /> · real <Change value={r.expenseRealChange} invert />
          </p>
        </Card>
        <Card>
          <p className="text-xs text-ink-3">Ahorro</p>
          <p className={`num text-xl font-semibold ${c.savingCents < 0 ? "text-bad" : ""}`}>{formatARS(c.savingCents)}</p>
          <p className="text-xs text-ink-3">{r.savingsRate !== null ? `${formatPct(r.savingsRate, 0)} de lo que entró` : "Sin ingresos cargados"}</p>
        </Card>
        <Card>
          <p className="text-xs text-ink-3">Inflación del mes</p>
          <p className="num text-xl font-semibold">{formatPct(c.ipc, 1)}</p>
          <p className="text-xs text-ink-3">
            {c.ipcEstimated ? "estimada" : "IPC cargado"} · 12 meses {formatPct(r.inflation12m, 0)}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Poder adquisitivo</CardTitle>
            <CardDescription>Cada mes llevado a pesos de {monthLabel(month)}: si la línea de ingresos baja, la plata te rinde menos.</CardDescription>
          </div>
        </CardHeader>
        {r.purchasingPower ? (
          <p className="mb-4 text-sm">
            Lo que entró en {monthLabel(month)} compra{" "}
            <span className={`font-semibold ${r.purchasingPower.change >= 0 ? "text-good" : "text-bad"}`}>
              {formatPct(Math.abs(r.purchasingPower.change), 1)} {r.purchasingPower.change >= 0 ? "más" : "menos"}
            </span>{" "}
            que lo de {monthLabel(r.purchasingPower.fromMonth)}, ya descontada la inflación.
          </p>
        ) : (
          <p className="mb-4 text-sm text-ink-3">Cuando tengas ingresos cargados en más de un mes vas a ver cómo cambia lo que te rinde la plata.</p>
        )}
        {hasData && (
          <ReportChart data={shown.map((m) => ({ month: m.month, ingresosReales: m.realIncomeCents, gastosReales: m.realExpenseCents, ingresos: m.incomeCents }))} />
        )}
        {r.anyEstimated && (
          <p className="mt-3 text-[11px] text-ink-3">
            En los meses sin IPC cargado se usa la inflación estimada ({formatPct(ctx.settings.monthlyInflation, 1)} mensual). Cargá el IPC en{" "}
            <Link href="/configuracion" className="text-accent hover:underline">
              Configuración
            </Link>{" "}
            para que el cálculo sea exacto.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Gastos por categoría</CardTitle>
              <CardDescription>Contra {r.previous ? monthLabel(r.previous.month) : "el mes anterior"}. &quot;Real&quot; descuenta la inflación del mes.</CardDescription>
            </div>
          </CardHeader>
          {r.categories.length === 0 ? (
            <p className="text-sm text-ink-3">No hay gastos este mes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-ink-3">
                    <th className="py-1 font-normal">Categoría</th>
                    <th className="py-1 text-right font-normal">Este mes</th>
                    <th className="hidden py-1 text-right font-normal sm:table-cell">Anterior</th>
                    <th className="py-1 text-right font-normal">Var.</th>
                    <th className="py-1 text-right font-normal">Real</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {r.categories.map((k) => (
                    <tr key={k.category}>
                      <td className="py-2">
                        {k.category}
                        <span className="ml-1 text-[11px] text-ink-3">{k.share ? formatPct(k.share, 0) : ""}</span>
                      </td>
                      <td className="num py-2 text-right font-medium">{formatARS(k.cents)}</td>
                      <td className="num hidden py-2 text-right text-ink-2 sm:table-cell">{formatARS(k.prevCents)}</td>
                      <td className="py-2 text-right">
                        <Change value={k.change} invert />
                      </td>
                      <td className="py-2 text-right">
                        <Change value={k.realChange} invert />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <div>
              <CardTitle>Sueldos en pesos de hoy</CardTitle>
              <CardDescription>Los cobros marcados como sueldo, ajustados por inflación.</CardDescription>
            </div>
          </CardHeader>
          {salaries.length === 0 ? (
            <p className="text-sm text-ink-3">Marcá tus cobros como &quot;Es mi sueldo&quot; en Movimientos para verlos acá.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {salaries.map((s) => {
                const f = factor.get(monthOf(s.date));
                return (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                    <span>{monthLabel(s.period)}</span>
                    <span className="text-right">
                      <span className="num block font-medium">{formatARS(s.amountCents)}</span>
                      {f && f !== 1 && <span className="num block text-[11px] text-ink-3">hoy {formatARS(Math.round(s.amountCents * f))}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Mes por mes</CardTitle>
            <CardDescription>Hasta 12 meses, como entraron y salieron.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="/api/export?format=xlsx&what=all">
              <Download className="h-3.5 w-3.5" /> Excel
            </a>
          </Button>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-[11px] text-ink-3">
                <th className="py-1 font-normal">Mes</th>
                <th className="py-1 text-right font-normal">Ingresos</th>
                <th className="py-1 text-right font-normal">Gastos</th>
                <th className="py-1 text-right font-normal">Ahorro</th>
                <th className="py-1 text-right font-normal">IPC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...shown].reverse().map((m) => (
                <tr key={m.month} className={m.month === month ? "font-medium" : ""}>
                  <td className="py-2">
                    <Link href={`/reporte?mes=${m.month}`} className="hover:underline">
                      {monthLabel(m.month)}
                    </Link>
                  </td>
                  <td className="num py-2 text-right">{formatARS(m.incomeCents)}</td>
                  <td className="num py-2 text-right">{formatARS(m.expenseCents)}</td>
                  <td className={`num py-2 text-right ${m.savingCents < 0 ? "text-bad" : ""}`}>{formatARS(m.savingCents)}</td>
                  <td className="num py-2 text-right text-ink-2">
                    {formatPct(m.ipc, 1)}
                    {m.ipcEstimated ? "*" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
