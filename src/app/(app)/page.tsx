import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Home, Plus, TrendingUp } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Stat } from "@/components/ui/stat";
import { CashflowChart } from "@/components/charts/cashflow-chart";
import { DemoNotice } from "@/components/dashboard/demo-notice";
import { buildDashboard } from "@/lib/dashboard";
import { loadFinanceContext } from "@/lib/data/context";
import { SetupNotice } from "@/components/dashboard/setup-notice";
import { formatARS, formatPct, todayAR } from "@/lib/finance";
import type { DueBucket } from "@/types/finance";
import { dateLabel, monthLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const BUCKET_TONE: Record<DueBucket, "bad" | "warn" | "accent" | "neutral" | "good"> = {
  overdue: "bad",
  today: "bad",
  next3: "warn",
  week: "accent",
  later: "neutral",
  paid: "good",
};

const STATUS_COPY = {
  ok: { label: "Vas bien", tone: "good" as const },
  tight: { label: "Ajustado", tone: "warn" as const },
  over: { label: "Te pasaste", tone: "bad" as const },
};

const INCOME_HINT = { manual: "cargado a mano", recibo: "último recibo", estimado: "estimado por convenio", ejemplo: "ejemplo", "sin datos": "cargalo en Configuración" } as const;

export default async function DashboardPage() {
  const ctx = await loadFinanceContext(todayAR());
  const d = buildDashboard(ctx);
  const s = d.safe;
  const status = STATUS_COPY[s.status];
  const used = s.availableMonthCents > 0 ? 1 - Math.max(0, s.remainingCents) / s.availableMonthCents : 1;

  return (
    <div className="space-y-6">
      {ctx.demo ? <DemoNotice /> : <SetupNotice ctx={ctx} />}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Cuánto puedo gastar */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Cuánto podés gastar hoy</CardTitle>
              <CardDescription>Quedan {s.daysLeft} días en el mes</CardDescription>
            </div>
            <Badge tone={status.tone}>{status.label}</Badge>
          </CardHeader>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
            <p className="num text-5xl font-semibold tracking-tight">{formatARS(s.perDayCents)}</p>
            <p className="pb-1.5 text-sm text-ink-2">
              <span className="num font-medium text-ink">{formatARS(s.perWeekCents)}</span> por semana
            </p>
          </div>
          <Progress value={used} className="mt-5" />
          <p className="mt-2 text-xs text-ink-3">
            Usaste {formatPct(used, 0)} de tu margen variable del mes ({formatARS(s.availableMonthCents)})
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
            <Stat label="Ingreso neto" value={formatARS(s.netIncomeCents)} hint={INCOME_HINT[d.netIncomeSource]} />
            <Stat label="Vencimientos y cuotas" value={formatARS(s.obligationsCents)} hint={`${formatARS(s.pendingObligationsCents)} por pagar`} />
            <Stat label="A objetivos" value={formatARS(s.goalContributionsCents)} />
            <Stat label="Te queda" value={formatARS(s.remainingCents)} tone={s.remainingCents < 0 ? "bad" : undefined} />
          </div>
          {d.nextIncome && (
            <p className="mt-4 rounded-xl bg-surface-muted px-3 py-2 text-xs text-ink-2">
              Próximo cobro: <span className="num font-medium text-ink">{formatARS(d.nextIncome.salary.amountCents)}</span> el{" "}
              {dateLabel(d.nextIncome.salary.date)}
              {d.nextIncome.prorated && ` (sueldo de ${monthLabel(d.nextIncome.salary.accrualMonth)}, ${d.nextIncome.salary.days} días trabajados)`}
              {d.nextIncome.sac && (
                <>
                  {" "}· Aguinaldo estimado <span className="num font-medium text-ink">{formatARS(d.nextIncome.sac.amountCents)}</span> hasta el {dateLabel(d.nextIncome.sac.date)}
                  {d.nextIncome.sac.daysWorked < d.nextIncome.sac.semesterDays && ` (${d.nextIncome.sac.daysWorked} de ${d.nextIncome.sac.semesterDays} días del semestre)`}
                </>
              )}
            </p>
          )}
        </Card>

        {/* Alertas */}
        <Card>
          <CardHeader>
            <CardTitle>Alertas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-ink-3" />
          </CardHeader>
          <ul className="space-y-3 text-sm">
            {d.anomalies.map((a) => (
              <li key={a.label} className="rounded-xl bg-warn-soft p-3 text-warn">
                <p className="font-medium">{a.label} viene alta</p>
                <p className="text-xs opacity-90">{a.reason}</p>
              </li>
            ))}
            {d.nextRent && (
              <li className="rounded-xl bg-surface-muted p-3">
                <p className="flex items-center gap-2 font-medium">
                  <Home className="h-4 w-4 text-ink-3" /> Aumento de alquiler el {dateLabel(d.nextRent.date)}
                </p>
                <p className="num text-xs text-ink-2">
                  {formatARS(d.nextRent.currentCents)} → {formatARS(d.nextRent.newCents)} (+{formatPct(d.nextRent.increasePct)})
                  {d.nextRent.projected && " · proyectado"}
                </p>
              </li>
            )}
            {d.cashflow.bottlenecks.length > 0 && (
              <li className="rounded-xl bg-bad-soft p-3 text-bad">
                <p className="font-medium">{d.cashflow.bottlenecks.length === 1 ? "Mes ajustado" : "Meses ajustados"}: {d.cashflow.bottlenecks.map(monthLabel).join(", ")}</p>
                <p className="text-xs opacity-90">Revisá el flujo de caja en Planificación.</p>
              </li>
            )}
            {d.anomalies.length === 0 && !d.nextRent && d.cashflow.bottlenecks.length === 0 && (
              <li className="text-ink-3">Nada para revisar.</li>
            )}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Semáforo de vencimientos */}
        <Card>
          <CardHeader>
            <CardTitle>Vencimientos</CardTitle>
            <CalendarClock className="h-4 w-4 text-ink-3" />
          </CardHeader>
          <div className="space-y-4">
            {d.due.length === 0 && <p className="text-sm text-ink-3">No hay vencimientos cargados.</p>}
            {d.due.map((g) => (
              <div key={g.bucket}>
                <div className="mb-1.5 flex items-center justify-between">
                  <Badge tone={BUCKET_TONE[g.bucket]}>{g.label}</Badge>
                  {g.items.length > 1 && <span className="num text-xs text-ink-3">{formatARS(g.totalCents)}</span>}
                </div>
                <ul className="divide-y divide-border">
                  {g.items.map((i) => (
                    <li key={i.id} className="flex items-center justify-between py-1.5 text-sm">
                      <span className={i.paid ? "text-ink-3 line-through" : ""}>{i.label}</span>
                      <span className="num text-ink-2">{formatARS(i.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <Button asChild variant="ghost" size="sm" className="mt-3 w-full">
            <Link href="/movimientos">
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </Card>

        {/* Cashflow */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Flujo de caja, próximos 6 meses</CardTitle>
              <CardDescription>Saldo mínimo proyectado: {formatARS(d.cashflow.minClosingCents)}</CardDescription>
            </div>
            <TrendingUp className="h-4 w-4 text-ink-3" />
          </CardHeader>
          <CashflowChart
            data={d.cashflow.months.map((m) => ({ month: m.month, ingresos: m.incomeCents, egresos: m.outflowCents, saldo: m.closingCents, bottleneck: m.bottleneck }))}
          />
        </Card>
      </div>

      {/* Objetivos */}
      <Card>
        <CardHeader>
          <CardTitle>Objetivos</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href="/planificacion">Planificar</Link>
          </Button>
        </CardHeader>
        <div className="grid gap-5 sm:grid-cols-2">
          {d.goals.length === 0 && <p className="text-sm text-ink-3">Todavía no tenés objetivos de ahorro.</p>}
          {d.goals.map((g) => (
            <div key={g.id}>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="font-medium">{g.name}</span>
                <span className="num text-xs text-ink-3">
                  {formatARS(g.savedCents)} de {formatARS(g.targetCents)}
                </span>
              </div>
              <Progress value={g.savedCents / g.targetCents} />
            </div>
          ))}
        </div>
      </Card>

      <Link
        href="/movimientos?nuevo=1"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-lg lg:bottom-8 lg:right-8"
        aria-label="Cargar gasto"
      >
        <Plus className="h-6 w-6" />
      </Link>
    </div>
  );
}
