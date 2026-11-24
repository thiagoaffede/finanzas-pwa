import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScenarioSimulator } from "@/components/forms/scenario-simulator";
import { GoalContribution, NewGoalForm } from "@/components/forms/goals-manager";
import { monthLabel, PROVIDER_NAME } from "@/lib/labels";
import { DemoNotice } from "@/components/dashboard/demo-notice";
import { buildCashflowInput, buildDashboard } from "@/lib/dashboard";
import { loadFinanceContext, type FinanceContext } from "@/lib/data/context";
import { addMonths, formatARS, formatPct, planGoal, priceVsInflation, todayAR } from "@/lib/finance";

export const metadata: Metadata = { title: "Objetivos y planificación" };
export const dynamic = "force-dynamic";

const ml = monthLabel;

/** Precios a comparar con la inflación: servicios (de las boletas) y, en modo ejemplo, algunos productos. */
function priceRows(ctx: FinanceContext) {
  const ipc = new Map((ctx.indices.ipc ?? []).map((p) => [p.month, p.rate]));
  const from = addMonths(ctx.month, -6);
  const series: { item: string; points: { month: string; priceCents: number }[] }[] = [];

  for (const [provider, hist] of Object.entries(ctx.billHistory)) {
    const byPeriod = new Map<string, number>();
    for (const h of hist ?? []) if (h.period >= from) byPeriod.set(h.period, h.amountCents);
    const points = [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, priceCents]) => ({ month, priceCents }));
    if (points.length >= 2) series.push({ item: PROVIDER_NAME[provider] ?? provider, points: [points[0], points[points.length - 1]] });
  }

  if (ctx.demo) {
    const m = ctx.month;
    series.push(
      { item: "Yerba 1 kg", points: [{ month: addMonths(m, -6), priceCents: 420_000 }, { month: m, priceCents: 520_000 }] },
      { item: "Leche 1 l", points: [{ month: addMonths(m, -6), priceCents: 130_000 }, { month: m, priceCents: 145_000 }] },
      { item: "Nafta súper 1 l", points: [{ month: addMonths(m, -6), priceCents: 115_000 }, { month: m, priceCents: 139_000 }] },
    );
  }

  return series.flatMap((p) => {
    const cmp = priceVsInflation(p.points, ipc, ctx.settings.monthlyInflation);
    return cmp ? [{ ...p, cmp }] : [];
  });
}

export default async function PlanificacionPage() {
  const ctx = await loadFinanceContext(todayAR());
  const d = buildDashboard(ctx);
  const margin = d.safe.availableMonthCents + d.safe.goalContributionsCents;
  const base = buildCashflowInput(ctx);
  const prices = priceRows(ctx);
  const canSave = !ctx.demo;

  return (
    <div className="space-y-6">
      <PageHeader title="Objetivos y planificación" description="Metas de ahorro, flujo de caja a 6 meses, simulador e historial de precios." />
      {ctx.demo && <DemoNotice />}

      <div className="grid gap-4 md:grid-cols-2">
        {ctx.goals.map((g) => {
          const plan = planGoal({
            targetCents: g.targetCents,
            savedCents: g.savedCents,
            today: ctx.today,
            targetDate: g.targetDate ?? undefined,
            monthlyContributionCents: g.monthlyContributionCents || undefined,
            monthlyMarginCents: margin,
          });
          return (
            <Card key={g.id}>
              <CardHeader>
                <div>
                  <CardTitle>{g.name}</CardTitle>
                  <CardDescription>
                    {formatARS(g.savedCents)} de {formatARS(g.targetCents)}
                  </CardDescription>
                </div>
                <Badge tone="accent">{formatPct(plan.progress, 0)}</Badge>
              </CardHeader>
              <Progress value={plan.progress} />
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-ink-3">Por mes</p>
                  <p className="num font-medium">{formatARS(plan.monthlyNeededCents ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-3">Por semana</p>
                  <p className="num font-medium">{formatARS(plan.weeklyNeededCents ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-3">Llegás en</p>
                  <p className="font-medium">{plan.reachMonth ? ml(plan.reachMonth) : "—"}</p>
                </div>
              </div>
              {plan.pctOfMargin !== null && <p className="mt-3 text-xs text-ink-3">Es el {formatPct(plan.pctOfMargin, 0)} de tu margen mensual.</p>}
              <GoalContribution goalId={g.id} canSave={canSave} />
            </Card>
          );
        })}
        <NewGoalForm canSave={canSave} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Flujo de caja proyectado</CardTitle>
            <CardDescription>Ingresos estimados, vencimientos, cuotas, alquiler ajustado y aportes a objetivos.</CardDescription>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] text-ink-3">
                <th className="py-1 font-normal">Mes</th>
                <th className="py-1 text-right font-normal">Ingresos</th>
                <th className="py-1 text-right font-normal">Alquiler</th>
                <th className="py-1 text-right font-normal">Cuotas</th>
                <th className="py-1 text-right font-normal">Servicios y gastos</th>
                <th className="py-1 text-right font-normal">Objetivos</th>
                <th className="py-1 text-right font-normal">Saldo</th>
                <th className="py-1 pl-3 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.cashflow.months.map((r) => (
                <tr key={r.month}>
                  <td className="py-2">{ml(r.month)}</td>
                  <td className="num py-2 text-right">{formatARS(r.incomeCents)}</td>
                  <td className="num py-2 text-right">{formatARS(r.byKind.rent ?? 0)}</td>
                  <td className="num py-2 text-right">{formatARS(r.byKind.installment ?? 0)}</td>
                  <td className="num py-2 text-right">{formatARS((r.byKind.bill ?? 0) + (r.byKind.expense ?? 0))}</td>
                  <td className="num py-2 text-right">{formatARS(r.byKind.goal ?? 0)}</td>
                  <td className={`num py-2 text-right font-medium ${r.closingCents < 0 ? "text-bad" : ""}`}>{formatARS(r.closingCents)}</td>
                  <td className="py-2 pl-3">{r.bottleneck && <Badge tone="bad" title={r.reasons.join(" · ")}>Ajustado</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!ctx.demo && ctx.settings.openingBalanceCents === 0 && (
          <p className="mt-3 text-xs text-ink-3">El saldo arranca en $ 0. Cargá tu saldo actual en Configuración para una proyección real.</p>
        )}
      </Card>

      <ScenarioSimulator base={base} defaultInflation={ctx.settings.monthlyInflation} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Historial de precios</CardTitle>
            <CardDescription>Últimos 6 meses vs. inflación (IPC cargado o {formatPct(ctx.settings.monthlyInflation)} mensual de referencia).</CardDescription>
          </div>
        </CardHeader>
        {prices.length === 0 ? (
          <p className="text-sm text-ink-3">Cuando tengas al menos dos boletas del mismo servicio vas a ver acá cómo subieron contra la inflación.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {prices.map((p) => (
              <li key={p.item} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="flex-1">
                  {p.item}
                  <span className="ml-2 text-[11px] text-ink-3">
                    {ml(p.cmp.from.month)} → {ml(p.cmp.to.month)}
                  </span>
                </span>
                <span className="num text-ink-2">
                  {formatARS(p.cmp.from.priceCents)} → {formatARS(p.cmp.to.priceCents)}
                </span>
                <span className="num w-16 text-right">
                  {p.cmp.priceChange >= 0 ? "+" : ""}
                  {formatPct(p.cmp.priceChange, 0)}
                </span>
                <Badge tone={p.cmp.realChange > 0 ? "warn" : "good"}>
                  {p.cmp.realChange > 0 ? "Sobre" : "Bajo"} inflación ({p.cmp.realChange > 0 ? "+" : ""}
                  {formatPct(p.cmp.realChange, 0)})
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
