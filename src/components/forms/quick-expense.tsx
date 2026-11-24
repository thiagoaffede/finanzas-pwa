"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CloudOff, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "./money-input";
import {
  enqueue,
  flushQueue,
  readQueue,
  type QueuedTransaction,
} from "@/lib/offline-queue";
import { formatARS, todayAR } from "@/lib/finance";
import type { PaymentMethod } from "@/types/finance";

const CATEGORIES = [
  "Comida",
  "Hogar",
  "Traslados",
  "Salud",
  "Salidas",
  "Ropa",
  "Servicios",
  "Otros",
];

const LAST_ACCOUNT = "finanzas.lastAccount";

export function QuickExpense({
  onQueued,
  onSynced,
  accounts = [],
}: {
  onQueued?: (tx: QueuedTransaction) => void;
  onSynced?: () => void;
  accounts?: { id: string; name: string; kind: string }[];
}) {
  const params = useSearchParams();
  const [income, setIncome] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Comida");
  const [method, setMethod] = useState<PaymentMethod>("debito");
  const [installments, setInstallments] = useState(1);
  const [owedBy, setOwedBy] = useState("");
  const [owed, setOwed] = useState(0);
  const [pending, setPending] = useState(0);
  const [saved, setSaved] = useState(false);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    const sync = () =>
      flushQueue().then((left) => {
        setPending(left);
        onSynced?.();
      });
    queueMicrotask(() => {
      setPending(readQueue().length);
      try {
        const last = localStorage.getItem(LAST_ACCOUNT);
        if (last && accounts.some((a) => a.id === last)) setAccountId(last);
      } catch {
        /* sin almacenamiento */
      }
    });
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0) return;
    const tx: QueuedTransaction = {
      clientId: crypto.randomUUID(),
      queuedAt: new Date().toISOString(),
      date: todayAR(),
      amountCents: amount,
      isIncome: income,
      paymentMethod: income ? "transferencia" : method,
      installmentsCount: !income && method === "cuotas" ? installments : 1,
      description: description || (income ? "Ingreso" : category),
      item: description || null,
      owedByName: !income && owedBy ? owedBy : null,
      owedCents: !income && owedBy ? owed : 0,
      category: income ? "Ingresos" : category,
      accountId: accountId || null,
      notes: null,
    };
    try {
      localStorage.setItem(LAST_ACCOUNT, accountId);
    } catch {
      /* sin almacenamiento */
    }
    enqueue(tx);
    onQueued?.(tx);
    setPending(await flushQueue());
    onSynced?.();
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    setAmount(0);
    setDescription("");
    setOwedBy("");
    setOwed(0);
    setFormKey((k) => k + 1);
  }

  return (
    <Card
      id="nuevo"
      className={params.get("nuevo") ? "ring-2 ring-accent/30" : ""}
    >
      <CardHeader>
        <div className="flex items-center gap-1 rounded-xl bg-surface-muted p-1 text-sm">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setIncome(v)}
              className={`rounded-lg px-3 py-1 ${income === v ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-3"}`}
            >
              {v ? "Ingreso" : "Gasto"}
            </button>
          ))}
        </div>
        {pending > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-warn">
            <CloudOff className="h-3.5 w-3.5" /> {pending} sin sincronizar
          </span>
        )}
      </CardHeader>
      <form
        key={formKey}
        onSubmit={submit}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <Field label="Monto" className="col-span-2 sm:col-span-1">
          <MoneyInput valueCents={amount} onChange={setAmount} />
        </Field>
        <Field label="Detalle" className="col-span-2 sm:col-span-1">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              income ? "Ej. Sueldo, venta, reintegro" : "Ej. Supermercado"
            }
          />
        </Field>
        {!income && (
          <>
            <Field label="Categoría">
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Medio de pago">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                <option value="contado">Efectivo</option>
                <option value="debito">Débito</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta (1 pago)</option>
                <option value="cuotas">Tarjeta en cuotas</option>
              </Select>
            </Field>
            {method === "cuotas" && (
              <Field
                label="Cuotas"
                hint={
                  amount
                    ? `${formatARS(Math.round(amount / installments))} c/u`
                    : undefined
                }
              >
                <Input
                  type="number"
                  min={2}
                  max={60}
                  value={installments}
                  onChange={(e) =>
                    setInstallments(Math.max(2, Number(e.target.value) || 2))
                  }
                />
              </Field>
            )}
            <Field label="¿Te deben una parte?" hint="Nombre (opcional)">
              <Input
                value={owedBy}
                onChange={(e) => setOwedBy(e.target.value)}
                placeholder="Ej. Juan"
              />
            </Field>
            {owedBy && (
              <Field label="Monto a recuperar">
                <MoneyInput valueCents={owed} onChange={setOwed} />
              </Field>
            )}
          </>
        )}
        {accounts.length > 0 && (
          <Field label={income ? "Entra en" : "Sale de"}>
            <Select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Sin cuenta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="col-span-2 flex items-end sm:col-span-4">
          <Button
            type="submit"
            variant="accent"
            className="w-full sm:w-auto"
            disabled={amount <= 0}
          >
            {saved ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {saved ? "Guardado" : income ? "Guardar ingreso" : "Guardar gasto"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
