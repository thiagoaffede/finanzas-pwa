import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DemoNotice } from "@/components/dashboard/demo-notice";
import { CreateEmergencyGoal, SplitEditor, SuggestedBudgets } from "@/components/forms/money-plan";
import { loadFinanceContext } from "@/lib/data/context";
import { moneyPlan } from "@/lib/dashboard";
import { formatARS, todayAR } from "@/lib/finance";

export const metadata: Metadata = { title: "Mi plan" };
export const dynamic = "force-dynamic";

const SOURCE = { manual: "cargado a mano", recibo: "tu último recibo", estimado: "estimado por convenio", ejemplo: "ejemplo", "sin datos": "sin datos" } as const;
const TONE_LABEL = { good: "Bien", warn: "Ojo", bad: "Revisar" } as const;
const pct = (x: number) => `${Math.round(x * 100)} %`;

export default async function PlanPage() {
  const ctx = await loadFinanceContext(todayAR());
  const { plan, emergencyGoal, hasAccounts } = moneyPlan(ctx);
  const canSave = !ctx.demo;

  if (plan.netIncomeCents <= 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mi plan" description="Cómo repartir el sueldo, cuánto ahorrar y cómo venís." />
        <Card>
          <CardTitle>Falta tu sueldo</CardTitle>
          <p className="mt-2 text-sm text-ink-2">
            Para armar el plan necesito tu neto: cargá tu puesto en{" "}
            <Link href="/configuracion" className="text-accent underline-offset-2 hover:underline">
              Configuración
            </Link>{" "}
            o un recibo de sueldo.
          </p>
        </Card>
      </div>
    );
  }

  const top = plan.tips.filter((t) => t.tone !== "good");
  const savingsBlock = plan.blocks.find((b) => b.key === "savings")!;
  const e = plan.emergency;

  return (
    <div className="space-y-6">
      <PageHeader title="Mi plan" description="Cómo repartir el sueldo, cuánto ahorrar y cómo venís este mes, con tus números." />
      {ctx.demo && <DemoNotice />}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Separá {formatARS(savingsBlock.plannedCents)} el día que cobrás</CardTitle>
            <CardDescription>
              Sobre un neto de {formatARS(plan.netIncomeCents)} ({SOURCE[ctx.netIncomeSource]}): {pct(plan.split.needs)} necesarios, {pct(plan.split.wants)} libres y{" "}
              {pct(plan.split.savings)} ahorro. El ahorro va primero; se gasta con lo que queda.
            </CardDescription>
          </div>
          <SplitEditor split={plan.split} canSave={canSave} />
        </CardHeader>
        <ul className="space-y-4">
          {plan.blocks.map((b) => {
            const ratio = b.plannedCents ? b.actualCents / b.plannedCents : 0;
            const isSavings = b.key === "savings";
            const tone = isSavings ? (ratio >= 0.995 ? "good" : ratio >= 0.5 ? "warn" : "bad") : ratio > 1 ? "bad" : ratio >= 0.8 ? "warn" : "accent";
            return (
              <li key={b.key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {b.label} <span className="text-xs font-normal text-ink-3">{pct(b.pct)}</span>
                  </span>
                  <span className="num text-xs text-ink-2">
                    {formatARS(b.actualCents)} <span className="text-ink-3">de {formatARS(b.plannedCents)}</span>
                  </span>
                </div>
                <Progress value={ratio} tone={tone} />
                <p className="mt-1 text-[11px] text-ink-3">
                  {b.key === "needs"
                    ? `Incluye ${formatARS(plan.fixedCents)} de alquiler, servicios y cuotas.`
                    : b.key === "wants"
                      ? "Salidas, ropa, suscripciones, regalos y gustos."
                      : "Proyectado a fin de mes con lo que venís gastando."}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {plan.indicators.map((i) => (
          <Card key={i.key} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-ink-3">{i.label}</p>
              <Badge tone={i.tone}>{TONE_LABEL[i.tone]}</Badge>
            </div>
            <p className={`num mt-1 text-xl font-semibold ${i.tone === "good" ? "text-good" : i.tone === "warn" ? "text-warn" : "text-bad"}`}>{i.value}</p>
            <p className="text-[11px] text-ink-3">{i.detail}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{top.length ? "Qué te conviene hacer" : "Vas bien"}</CardTitle>
            <CardDescription>Según cómo viene tu mes. Se actualiza con cada movimiento.</CardDescription>
          </div>
        </CardHeader>
        <ul className="space-y-3">
          {plan.tips.map((t) => (
            <li key={t.key} className={`rounded-xl border-l-4 bg-surface-muted p-3 text-sm ${t.tone === "bad" ? "border-bad" : t.tone === "warn" ? "border-warn" : "border-good"}`}>
              <p className="font-medium">{t.title}</p>
              <p className="mt-0.5 text-ink-2">{t.text}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Fondo de emergencia</CardTitle>
            <CardDescription>
              Meta: {formatARS(e.targetCents)}, 3 meses de gastos necesarios (ideal {formatARS(e.idealCents)}, 6 meses). Es para imprevistos, no para compras planeadas; se guarda en una cuenta remunerada o un money market.
            </CardDescription>
          </div>
        </CardHeader>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="num">{formatARS(e.savedCents)}</span>
          <span className="text-xs text-ink-3">
            {e.monthsToTarget === 0 ? "Completo" : e.monthsToTarget ? `Faltan ${e.monthsToTarget} ${e.monthsToTarget === 1 ? "mes" : "meses"} ahorrando el ${pct(plan.split.savings)}` : ""}
          </span>
        </div>
        <Progress value={e.targetCents ? e.savedCents / e.targetCents : 0} tone={e.months >= 3 ? "good" : "accent"} />
        <div className="mt-4 text-xs text-ink-3">
          {emergencyGoal ? (
            <p>
              Lo seguís en el objetivo «{emergencyGoal.name}» de{" "}
              <Link href="/planificacion" className="text-accent underline-offset-2 hover:underline">
                Planificación
              </Link>
              {hasAccounts ? ", o con una cuenta de tipo «reserva»." : "."}
            </p>
          ) : (
            <CreateEmergencyGoal targetCents={e.targetCents} monthlyCents={savingsBlock.plannedCents} canSave={canSave} />
          )}
        </div>
        {plan.idle.cents > 0 && (
          <p className="mt-4 text-sm text-ink-2">
            En la cuenta del día a día te sobran unos <span className="num font-medium">{formatARS(plan.idle.cents)}</span> para lo que queda del mes. Quietos, pierden{" "}
            <span className="num">{formatARS(plan.idle.monthlyLossCents)}</span> por mes con la inflación.
          </p>
        )}
      </Card>

      <SuggestedBudgets suggested={plan.suggestedBudgets} current={ctx.settings.budgets} canSave={canSave} />
    </div>
  );
}
