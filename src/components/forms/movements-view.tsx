"use client";

import { Suspense, useEffect, useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuickExpense } from "./quick-expense";
import { readQueue, type QueuedTransaction } from "@/lib/offline-queue";
import { formatARS } from "@/lib/finance/money";
import type { DemoTransaction } from "@/lib/demo-data";

const METHOD: Record<string, string> = { contado: "Efectivo", debito: "Débito", tarjeta: "Tarjeta", cuotas: "Cuotas", transferencia: "Transf." };
const fmtDate = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);

export function MovementsView({ transactions }: { transactions: DemoTransaction[] }) {
  const [local, setLocal] = useState<QueuedTransaction[]>([]);
  useEffect(() => queueMicrotask(() => setLocal(readQueue())), []);

  const rows = [
    ...local.map((t) => ({
      id: t.clientId,
      date: t.date,
      description: t.description ?? "",
      category: t.notes ?? "",
      amountCents: t.amountCents,
      paymentMethod: t.paymentMethod,
      installments: t.installmentsCount,
      owedByName: t.owedByName ?? undefined,
      owedCents: t.owedCents,
      local: true,
    })),
    ...transactions.map((t) => ({ ...t, local: false })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const owed = rows.filter((r) => r.owedByName && r.owedCents);

  return (
    <div className="space-y-4">
      <Suspense>
        <QuickExpense onAdded={(tx) => setLocal((l) => [...l, tx])} />
      </Suspense>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Movimientos del mes</CardTitle>
            <span className="num text-xs text-ink-3">{formatARS(rows.reduce((s, r) => s + r.amountCents, 0))}</span>
          </CardHeader>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="num w-10 shrink-0 text-xs text-ink-3">{fmtDate(r.date)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{r.description}</p>
                  <p className="text-[11px] text-ink-3">
                    {r.category} · {METHOD[r.paymentMethod]}
                    {r.installments && r.installments > 1 ? ` ${r.installments}x` : ""}
                    {r.local && " · pendiente de sincronizar"}
                  </p>
                </div>
                <span className="num shrink-0 font-medium">{formatARS(r.amountCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Gastos a recuperar</CardTitle>
              <CardDescription>No cuentan como gasto tuyo.</CardDescription>
            </div>
          </CardHeader>
          {owed.length === 0 ? (
            <p className="text-sm text-ink-3">Nadie te debe nada.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {owed.map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  <span>
                    {r.owedByName} <span className="text-xs text-ink-3">· {r.description}</span>
                  </span>
                  <Badge tone="accent">{formatARS(r.owedCents ?? 0)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
