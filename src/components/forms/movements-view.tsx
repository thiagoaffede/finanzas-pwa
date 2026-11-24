"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { MoneyInput } from "./money-input";
import { CATEGORIES, type SalaryHint } from "./quick-expense";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuickExpense } from "./quick-expense";
import { readQueue, type QueuedTransaction } from "@/lib/offline-queue";
import { formatARS } from "@/lib/finance/money";
import { send } from "@/lib/client-api";
import type { TxView } from "@/lib/data/context";

const METHOD: Record<string, string> = { contado: "Efectivo", debito: "Débito", tarjeta: "Tarjeta", cuotas: "Cuotas", transferencia: "Transf." };
const fmtDate = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);

type Account = { id: string; name: string; kind: string };

export function MovementsView({
  transactions,
  canSave,
  accounts = [],
  salary = null,
  nextPayday,
}: {
  transactions: TxView[];
  canSave: boolean;
  accounts?: Account[];
  salary?: SalaryHint | null;
  nextPayday?: string;
}) {
  const [editing, setEditing] = useState<TxView | null>(null);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const router = useRouter();
  const [local, setLocal] = useState<QueuedTransaction[]>([]);
  useEffect(() => queueMicrotask(() => setLocal(readQueue())), []);

  const rows = [
    ...local.map((t) => ({
      id: t.clientId,
      date: t.date,
      description: t.description ?? "",
      category: t.category ?? "",
      amountCents: t.amountCents,
      paymentMethod: t.paymentMethod,
      installments: t.installmentsCount,
      owedByName: t.owedByName ?? undefined,
      owedCents: t.owedCents,
      reimbursedCents: 0,
      isIncome: t.isIncome,
      accountId: t.accountId,
      billId: null,
      salaryPeriod: t.salaryPeriod ?? null,
      local: true,
    })),
    ...transactions.map((t) => ({ ...t, local: false })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const owed = rows.filter((r) => !r.isIncome && r.owedByName && r.owedCents > 0);
  const net = rows.reduce((s, r) => s + (r.isIncome ? r.amountCents : -r.amountCents), 0);

  async function markReimbursed(id: string, cents: number) {
    const r = await send(`/api/transactions/${id}`, "PATCH", { reimbursedCents: cents });
    if (r.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <Suspense>
        <QuickExpense
          accounts={accounts}
          salary={salary}
          nextPayday={nextPayday}
          onSynced={() => {
            setLocal(readQueue());
            router.refresh();
          }}
          onQueued={(tx) => setLocal((l) => [...l.filter((x) => x.clientId !== tx.clientId), tx])}
        />
      </Suspense>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Movimientos del mes</CardTitle>
            <span className="num text-xs text-ink-3">Neto {formatARS(net)}</span>
          </CardHeader>
          {rows.length === 0 ? (
            <p className="text-sm text-ink-3">Todavía no cargaste movimientos este mes.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={!canSave || r.local}
                    onClick={() => setEditing(r)}
                    className="flex w-full items-center gap-3 py-2.5 text-left text-sm disabled:cursor-default"
                  >
                    <span className="num w-10 shrink-0 text-xs text-ink-3">{fmtDate(r.date)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{r.description}</p>
                      <p className="text-[11px] text-ink-3">
                        {r.isIncome ? (r.salaryPeriod ? "Sueldo" : "Ingreso") : `${r.category} · ${METHOD[r.paymentMethod]}`}
                        {r.installments > 1 ? ` ${r.installments}x` : ""}
                        {r.accountId && accountName.get(r.accountId) ? ` · ${accountName.get(r.accountId)}` : ""}
                        {r.local && " · pendiente de sincronizar"}
                      </p>
                    </div>
                    <span className={`num shrink-0 font-medium ${r.isIncome ? "text-good" : ""}`}>
                      {r.isIncome ? "+" : "−"}
                      {formatARS(r.amountCents)}
                    </span>
                    {canSave && !r.local && <Pencil className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-label="Editar" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
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
              {owed.map((r) => {
                const settled = r.reimbursedCents >= r.owedCents;
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {r.owedByName} <span className="text-xs text-ink-3">· {r.description}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge tone={settled ? "good" : "accent"}>{settled ? "Devuelto" : formatARS(r.owedCents - r.reimbursedCents)}</Badge>
                      {canSave && !r.local && !settled && (
                        <Button variant="ghost" size="sm" onClick={() => markReimbursed(r.id, r.owedCents)}>
                          Me pagó
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      {editing && <TxEditor tx={editing} accounts={accounts} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Editar o borrar un movimiento ya cargado. */
function TxEditor({ tx, accounts, onClose }: { tx: TxView; accounts: Account[]; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState(tx.amountCents);
  const [description, setDescription] = useState(tx.description);
  const [category, setCategory] = useState(tx.category);
  const [date, setDate] = useState(tx.date);
  const [accountId, setAccountId] = useState(tx.accountId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (amount <= 0) return setError("Poné un monto.");
    setBusy(true);
    const r = await send(`/api/transactions/${tx.id}`, "PATCH", {
      amountCents: amount,
      description: description.trim() || null,
      ...(tx.isIncome ? {} : { category }),
      date,
      accountId: accountId || null,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  async function remove() {
    const extra = tx.billId ? " La boleta vuelve a quedar como pendiente." : tx.installments > 1 ? " También se borran sus cuotas." : "";
    if (!window.confirm(`¿Borrar "${tx.description}"?${extra}`)) return;
    setBusy(true);
    const r = await send(`/api/transactions/${tx.id}`, "DELETE");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  return (
    <Dialog title={tx.isIncome ? "Editar ingreso" : "Editar gasto"} onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Monto" hint={tx.installments > 1 ? `Total de la compra; se reparte en ${tx.installments} cuotas.` : undefined}>
          <MoneyInput valueCents={amount} onChange={setAmount} />
        </Field>
        <Field label="Detalle">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {!tx.isIncome && (
            <Field label="Categoría">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {[...new Set([...CATEGORIES, category])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {accounts.length > 0 && (
          <Field label={tx.isIncome ? "Entró en" : "Salió de"}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Sin cuenta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
      <div className="mt-5 flex items-center gap-2">
        <Button disabled={busy} onClick={save}>
          Guardar cambios
        </Button>
        <Button variant="ghost" disabled={busy} onClick={remove} className="ml-auto text-bad">
          <Trash2 className="h-3.5 w-3.5" /> Borrar
        </Button>
      </div>
    </Dialog>
  );
}
