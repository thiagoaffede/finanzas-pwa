"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, Pencil, Plus, X } from "lucide-react";
import { TransferDialog } from "./transfer-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { MoneyInput } from "./money-input";
import { send } from "@/lib/client-api";
import { formatARS } from "@/lib/finance/money";
import type { AccountKind, AccountView } from "@/lib/data/repository";

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  banco: "Banco",
  billetera: "Billetera virtual",
  efectivo: "Efectivo",
  reserva: "Ahorro / reserva",
  tarjeta: "Tarjeta de crédito",
};

/** Cuentas con su saldo: alta, ajuste de saldo y archivo. */
export function AccountsManager({ accounts, canSave }: { accounts: AccountView[]; canSave: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState(0);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("banco");
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  const cash = accounts.filter((a) => a.kind !== "tarjeta");
  const total = cash.reduce((s, a) => s + a.balanceCents, 0);

  async function run(url: string, method: string, body: unknown) {
    setBusy(true);
    setError(null);
    const r = await send(url, method, body);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <Card id="cuentas">
      <CardHeader>
        <div>
          <CardTitle>Cuentas</CardTitle>
          <CardDescription>
            {cash.length ? (
              <>
                Total disponible <span className="num font-medium text-ink">{formatARS(total)}</span> · se usa como saldo del flujo de caja
              </>
            ) : (
              "Cargá dónde tenés la plata (banco, billetera, efectivo) para seguir el saldo de cada una."
            )}
          </CardDescription>
        </div>
        {canSave && !adding && (
          <div className="flex shrink-0 items-center gap-1">
            {accounts.length >= 2 && (
              <Button variant="outline" size="sm" onClick={() => setTransferring(true)}>
                <ArrowRightLeft className="h-3.5 w-3.5" /> Transferir
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Nueva
            </Button>
          </div>
        )}
      </CardHeader>

      {accounts.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              <div className="min-w-0 flex-1 basis-32">
                <p className="font-medium">{a.name}</p>
                <p className="text-[11px] text-ink-3">{ACCOUNT_KIND_LABEL[a.kind]}</p>
              </div>
              {editing === a.id ? (
                <>
                  <div className="w-40">
                    <MoneyInput valueCents={a.balanceCents} onChange={setValue} />
                  </div>
                  <Button
                    size="sm"
                    aria-label="Guardar saldo"
                    disabled={busy}
                    onClick={async () => {
                      if (await run(`/api/accounts/${a.id}`, "PATCH", { balanceCents: a.kind === "tarjeta" ? -Math.abs(value) : value })) setEditing(null);
                    }}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Cancelar" onClick={() => setEditing(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <button className="w-full text-left text-[11px] text-ink-3 hover:text-bad" disabled={busy} onClick={() => run(`/api/accounts/${a.id}`, "PATCH", { archived: true })}>
                    Archivar esta cuenta
                  </button>
                </>
              ) : (
                <>
                  <span className={`num font-medium ${a.balanceCents < 0 ? "text-bad" : ""}`}>
                    {a.kind === "tarjeta" && a.balanceCents < 0 ? `Debés ${formatARS(-a.balanceCents)}` : formatARS(a.balanceCents)}
                  </span>
                  {canSave && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Ajustar saldo"
                      title="Ajustar al saldo real"
                      onClick={() => {
                        setValue(Math.abs(a.balanceCents));
                        setEditing(a.id);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-3 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Banco Nación" maxLength={60} />
          </Field>
          <Field label="Tipo">
            <Select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {Object.entries(ACCOUNT_KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={kind === "tarjeta" ? "Deuda actual" : "Saldo actual"}>
            <MoneyInput valueCents={balance} onChange={setBalance} />
          </Field>
          <div className="flex items-center gap-2 sm:col-span-3">
            <Button
              disabled={busy || !name.trim()}
              onClick={async () => {
                const ok = await run("/api/accounts", "POST", { name: name.trim(), kind, balanceCents: kind === "tarjeta" ? -Math.abs(balance) : balance });
                if (ok) {
                  setAdding(false);
                  setName("");
                  setBalance(0);
                }
              }}
            >
              Agregar cuenta
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {accounts.length > 0 && (
        <p className="mt-3 text-[11px] text-ink-3">
          El saldo se mueve con los gastos, ingresos y transferencias que cargues en cada cuenta. Si no coincide con el banco, tocá el lápiz y poné el real.
        </p>
      )}
      {!canSave && <p className="mt-2 text-xs text-ink-3">Conectá la base de datos para guardar.</p>}
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      {transferring && <TransferDialog accounts={accounts} onClose={() => setTransferring(false)} />}
    </Card>
  );
}
