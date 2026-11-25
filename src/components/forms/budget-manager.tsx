"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { MoneyInput } from "./money-input";
import { CATEGORIES } from "./quick-expense";
import { send } from "@/lib/client-api";
import { formatARS } from "@/lib/finance/money";
import type { BudgetRow } from "@/lib/finance/budget";

const TONE = { ok: "good", warn: "warn", over: "bad" } as const;

/** Presupuesto del mes por categoría: cuánto llevás gastado contra el tope. */
export function BudgetManager({
  rows,
  unbudgeted,
  limits,
  canSave,
  daysLeft,
}: {
  rows: BudgetRow[];
  unbudgeted: { category: string; spentCents: number }[];
  limits: Record<string, number>;
  canSave: boolean;
  daysLeft: number;
}) {
  const [editing, setEditing] = useState(false);
  const totalLimit = rows.reduce((s, r) => s + r.limitCents, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spentCents, 0);
  const totalPct = totalLimit ? totalSpent / totalLimit : 0;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Presupuesto del mes</CardTitle>
          <CardDescription>
            {rows.length
              ? `Gastaste ${formatARS(totalSpent)} de ${formatARS(totalLimit)} · quedan ${daysLeft} días. Las compras en cuotas cuentan de a una cuota por mes. Te avisamos al llegar al 80 % y si te pasás.`
              : "Poné un tope por categoría (comida, salidas, ropa…) y te avisamos cuando te acerques."}
          </CardDescription>
        </div>
        {canSave && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> {rows.length ? "Editar topes" : "Armar presupuesto"}
          </Button>
        )}
      </CardHeader>

      {rows.length > 0 && (
        <>
          <Progress value={totalPct} tone={totalPct > 1 ? "bad" : totalPct >= 0.8 ? "warn" : "accent"} className="mb-5 h-2.5" />
          <ul className="space-y-4">
            {rows.map((r) => (
              <li key={r.category}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{r.category}</span>
                  <span className="num text-xs text-ink-2">
                    {formatARS(r.spentCents)} <span className="text-ink-3">de {formatARS(r.limitCents)}</span>
                  </span>
                </div>
                <Progress value={r.pct} tone={TONE[r.status] === "good" ? "accent" : TONE[r.status]} />
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-3">
                  <span>
                    {r.remainingCents >= 0 ? `Quedan ${formatARS(r.remainingCents)} · ${formatARS(r.perDayCents)} por día` : `Te pasaste ${formatARS(-r.remainingCents)}`}
                  </span>
                  {r.status !== "over" && r.projectedCents > r.limitCents && r.spentCents > 0 ? (
                    <Badge tone="warn">A este ritmo: {formatARS(r.projectedCents)}</Badge>
                  ) : (
                    <Badge tone={TONE[r.status]}>{Math.round(r.pct * 100)} %</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {unbudgeted.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium text-ink-2">Sin tope este mes</p>
          <ul className="space-y-1 text-sm">
            {unbudgeted.map((u) => (
              <li key={u.category} className="flex justify-between gap-2">
                <span>{u.category}</span>
                <span className="num text-ink-2">{formatARS(u.spentCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && <BudgetEditor limits={limits} spent={Object.fromEntries([...rows.map((r) => [r.category, r.spentCents]), ...unbudgeted.map((u) => [u.category, u.spentCents])])} onClose={() => setEditing(false)} />}
    </Card>
  );
}

function BudgetEditor({ limits, spent, onClose }: { limits: Record<string, number>; spent: Record<string, number>; onClose: () => void }) {
  const router = useRouter();
  const cats = [...new Set([...CATEGORIES.filter((c) => c !== "Otros"), ...Object.keys(limits), ...Object.keys(spent), "Otros"])];
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(cats.map((c) => [c, limits[c] ?? 0])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = Object.values(values).reduce((s, v) => s + v, 0);

  async function save() {
    setBusy(true);
    const budgets = Object.fromEntries(Object.entries(values).filter(([, v]) => v > 0));
    const r = await send("/api/settings", "PUT", { budgets });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  return (
    <Dialog title="Topes por categoría" onClose={onClose}>
      <p className="mb-4 text-xs text-ink-3">Dejá en 0 las categorías que no quieras controlar. Lo de este mes es lo que ya gastaste.</p>
      <div className="grid gap-3">
        {cats.map((c) => (
          <div key={c} className="grid grid-cols-[1fr_9rem] items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm">{c}</p>
              {spent[c] ? <p className="text-[11px] text-ink-3">Este mes: {formatARS(spent[c])}</p> : null}
            </div>
            <MoneyInput valueCents={values[c]} onChange={(v) => setValues((x) => ({ ...x, [c]: v }))} />
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm">
        Total: <span className="num font-medium">{formatARS(total)}</span>
      </p>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      <Button className="mt-4" disabled={busy} onClick={save}>
        Guardar presupuesto
      </Button>
    </Dialog>
  );
}
