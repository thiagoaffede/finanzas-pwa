import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DemoNotice } from "@/components/dashboard/demo-notice";
import { BudgetManager } from "@/components/forms/budget-manager";
import { RecurringList, ReminderSettings, type RecurringItem } from "@/components/forms/recurring-list";
import { CardInstallments } from "@/components/forms/card-installments";
import { PushToggle } from "@/components/forms/push-toggle";
import { loadFinanceContext, type FinanceContext } from "@/lib/data/context";
import { budgetSummary, currentRent } from "@/lib/dashboard";
import { addDays, addMonths, classifyDue, DUE_BUCKET_LABEL, daysInMonth, diffDays, formatARS, todayAR, toISODate } from "@/lib/finance";
import { dateLabel, monthLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Presupuesto y vencimientos" };
export const dynamic = "force-dynamic";

/** Por cada gasto fijo, la boleta pendiente más próxima (o la última pagada). */
function recurringItems(ctx: FinanceContext): RecurringItem[] {
  const bySeries = new Map<string, FinanceContext["bills"][number]>();
  for (const b of ctx.bills) {
    if (!b.recurring) continue;
    const cur = bySeries.get(b.series);
    const better = !cur || (cur.paid && !b.paid) || (cur.paid === b.paid && (b.paid ? b.dueDate > cur.dueDate : b.dueDate < cur.dueDate));
    if (better) bySeries.set(b.series, b);
  }
  return [...bySeries.values()]
    .map((bill) => ({ bill, nextDue: bill.paid ? addMonthsToISO(bill.dueDate, bill.recurrenceMonths) : bill.dueDate }))
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
}

function addMonthsToISO(date: string, n: number) {
  const m = addMonths(date.slice(0, 7), n);
  const [y, mm] = m.split("-").map(Number);
  return toISODate(y, mm, Math.min(Number(date.slice(8, 10)), daysInMonth(m)));
}

const TONE = { paid: "good", overdue: "bad", today: "bad", next3: "warn", week: "accent", later: "neutral" } as const;

/** Lo que vence en los próximos 45 días: boletas, gastos fijos, alquiler y resúmenes de tarjeta. */
function upcoming(ctx: FinanceContext) {
  const limit = addDays(ctx.today, 45);
  const items: { id: string; label: string; detail: string; dueDate: string; amountCents: number }[] = [];
  for (const b of ctx.bills) if (!b.paid && b.dueDate <= limit) items.push({ id: b.id, label: b.label, detail: b.recurring ? "Gasto fijo" : "Servicio", dueDate: b.dueDate, amountCents: b.amountCents });
  if (ctx.rent) {
    for (const m of [ctx.month, addMonths(ctx.month, 1)]) {
      const [y, mm] = m.split("-").map(Number);
      const due = toISODate(y, mm, Math.min(ctx.rent.dueDay, daysInMonth(m)));
      if (due >= ctx.today && due <= limit) items.push({ id: `rent-${m}`, label: "Alquiler", detail: "Alquiler", dueDate: due, amountCents: currentRent(ctx) });
    }
  }
  const card = new Map<string, { amountCents: number; dueDate: string; n: number }>();
  for (const p of ctx.cardPurchases)
    for (const q of p.pending) {
      if (q.dueDate < ctx.today || q.dueDate > limit) continue;
      const key = `${p.accountId ?? "sin"}:${q.dueDate}`;
      const c = card.get(key) ?? { amountCents: 0, dueDate: q.dueDate, n: 0 };
      c.amountCents += q.amountCents;
      c.n++;
      card.set(key, c);
    }
  const names = new Map(ctx.accounts.map((a) => [a.id, a.name]));
  for (const [key, c] of card) {
    const acc = key.split(":")[0];
    items.push({ id: `card-${key}`, label: `Tarjeta ${names.get(acc) ?? ""}`.trim(), detail: `${c.n} cuota${c.n === 1 ? "" : "s"}`, dueDate: c.dueDate, amountCents: c.amountCents });
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export default async function PresupuestoPage() {
  const ctx = await loadFinanceContext(todayAR());
  const budget = budgetSummary(ctx);
  const canSave = !ctx.demo;
  const next = upcoming(ctx);
  const nextTotal = next.reduce((s, i) => s + i.amountCents, 0);
  const daysLeft = diffDays(ctx.today, toISODate(Number(ctx.month.slice(0, 4)), Number(ctx.month.slice(5, 7)), daysInMonth(ctx.month))) + 1;
  const cards = ctx.accounts
    .filter((a) => a.kind === "tarjeta")
    .map(({ id, name, closingDay, dueDay, balanceCents }) => ({ id, name, closingDay, dueDay, balanceCents }));

  const payFrom = ctx.accounts.filter((a) => a.kind !== "tarjeta" && (a.currency ?? "ARS") === "ARS").map(({ id, name }) => ({ id, name }));

  return (
    <div className="space-y-6">
      <PageHeader title="Presupuesto y vencimientos" description={`Topes por categoría, gastos fijos, cuotas y lo que vence. ${monthLabel(ctx.month)}.`} />
      {ctx.demo && <DemoNotice />}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <BudgetManager rows={budget.rows} unbudgeted={budget.unbudgeted} limits={ctx.settings.budgets} canSave={canSave} daysLeft={daysLeft} />
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Próximos vencimientos</CardTitle>
                <CardDescription>
                  {next.length ? `${formatARS(nextTotal)} en los próximos 45 días.` : "No hay nada por vencer en los próximos 45 días."}
                </CardDescription>
              </div>
            </CardHeader>
            {next.length > 0 && (
              <ul className="divide-y divide-border text-sm">
                {next.map((i) => {
                  const bucket = classifyDue(i.dueDate, ctx.today, false);
                  return (
                    <li key={i.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{i.label}</p>
                        <p className="text-[11px] text-ink-3">
                          {i.detail} · vence {dateLabel(i.dueDate)}
                        </p>
                      </div>
                      <Badge tone={TONE[bucket]}>{DUE_BUCKET_LABEL[bucket]}</Badge>
                      <span className="num w-24 text-right font-medium">{formatARS(i.amountCents)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-5 border-t border-border pt-4">
              <ReminderSettings initial={ctx.settings.reminderDays} canSave={canSave} />
            </div>
          </Card>
          <PushToggle canSave={canSave} />
        </div>
        <div className="min-w-0 space-y-4">
          <RecurringList items={recurringItems(ctx)} rentCents={ctx.rent ? currentRent(ctx) : 0} canSave={canSave} />
          <CardInstallments purchases={ctx.cardPurchases} cards={cards} month={ctx.month} canSave={canSave} today={ctx.today} payFrom={payFrom} />
        </div>
      </div>
    </div>
  );
}
