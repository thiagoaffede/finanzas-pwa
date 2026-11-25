"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { MoneyInput } from "./money-input";
import { send } from "@/lib/client-api";
import { formatARS } from "@/lib/finance/money";
import { todayAR } from "@/lib/finance/dates";
import type { TransferView } from "@/lib/data/context";

type Account = { id: string; name: string; kind: string; balanceCents?: number };

/**
 * Pasar plata entre cuentas propias: banco ↔ billetera, retirar o depositar efectivo,
 * pagar la tarjeta. No es gasto ni ingreso: solo mueve saldo.
 */
export function TransferDialog({ accounts, transfer, onClose }: { accounts: Account[]; transfer?: TransferView; onClose: () => void }) {
  const router = useRouter();
  const [from, setFrom] = useState(transfer?.fromAccountId ?? "");
  const [to, setTo] = useState(transfer?.toAccountId ?? "");
  const [amount, setAmount] = useState(transfer?.amountCents ?? 0);
  const [date, setDate] = useState(transfer?.date ?? todayAR());
  const [note, setNote] = useState(transfer?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fromAcc = accounts.find((a) => a.id === from);
  const toAcc = accounts.find((a) => a.id === to);

  async function save() {
    if (!from || !to) return setError("Elegí de dónde sale y a dónde va.");
    if (from === to) return setError("Elegí dos cuentas distintas.");
    if (amount <= 0) return setError("Poné un monto.");
    setBusy(true);
    setError(null);
    const body = { fromAccountId: from, toAccountId: to, amountCents: amount, date, note: note.trim() || null };
    const r = transfer ? await send(`/api/transfers/${transfer.id}`, "PATCH", body) : await send("/api/transfers", "POST", body);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!transfer || !window.confirm("¿Borrar esta transferencia? La plata vuelve a la cuenta de origen.")) return;
    setBusy(true);
    const r = await send(`/api/transfers/${transfer.id}`, "DELETE");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  const options = (exclude: string) =>
    accounts
      .filter((a) => a.id !== exclude)
      .map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.balanceCents !== undefined && a.kind !== "tarjeta" ? ` (${formatARS(a.balanceCents)})` : ""}
        </option>
      ));

  const hint =
    toAcc?.kind === "tarjeta"
      ? "Pago de tarjeta: baja la deuda sin contarlo como gasto otra vez."
      : fromAcc?.kind === "efectivo"
        ? "Depósito de efectivo."
        : toAcc?.kind === "efectivo"
          ? "Retiro de efectivo."
          : undefined;

  return (
    <Dialog title={transfer ? "Editar transferencia" : "Transferir entre cuentas"} onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Sale de">
          <Select value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="" disabled>
              Elegí una cuenta
            </option>
            {options(to)}
          </Select>
        </Field>
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Invertir"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            <ArrowDownUp className="h-4 w-4" /> Invertir
          </Button>
        </div>
        <Field label="Va a" hint={hint}>
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="" disabled>
              Elegí una cuenta
            </option>
            {options(from)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto">
            <MoneyInput valueCents={amount} onChange={setAmount} />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Nota (opcional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ej. Retiro en cajero" />
        </Field>
      </div>
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
      <div className="mt-5 flex items-center gap-2">
        <Button disabled={busy} onClick={save}>
          {transfer ? "Guardar cambios" : "Transferir"}
        </Button>
        {transfer && (
          <Button variant="ghost" disabled={busy} onClick={remove} className="ml-auto text-bad">
            <Trash2 className="h-3.5 w-3.5" /> Borrar
          </Button>
        )}
      </div>
    </Dialog>
  );
}
