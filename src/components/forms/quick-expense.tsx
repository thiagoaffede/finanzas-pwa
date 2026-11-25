"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CloudOff, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "./money-input";
import { enqueue, flushQueue, readQueue, type QueuedTransaction } from "@/lib/offline-queue";
import { send } from "@/lib/client-api";
import { formatARS, todayAR } from "@/lib/finance";
import { dateLabel, monthLabel } from "@/lib/labels";
import type { PaymentMethod } from "@/types/finance";

export const CATEGORIES = ["Comida", "Hogar", "Traslados", "Salud", "Deporte", "Salidas", "Ropa", "Servicios", "Suscripciones", "Educación", "Regalos", "Otros"];

export const FREQUENCIES: { months: number; label: string }[] = [
  { months: 1, label: "Todos los meses" },
  { months: 2, label: "Cada 2 meses" },
  { months: 3, label: "Cada 3 meses" },
  { months: 6, label: "Cada 6 meses" },
  { months: 12, label: "Una vez por año" },
];

/** Presupuesto del mes por categoría (para avisar al guardar un gasto). */
export interface BudgetHint {
  category: string;
  limitCents: number;
  spentCents: number;
}

/** Sueldo que falta cobrar, para precargar el ingreso. */
export interface SalaryHint {
  /** Mes trabajado (YYYY-MM). */
  period: string;
  amountCents: number;
  date: string;
}

const LAST_ACCOUNT = "finanzas.lastAccount";

export function QuickExpense({
  onQueued,
  onSynced,
  accounts = [],
  salary = null,
  nextPayday,
  budgets = [],
}: {
  budgets?: BudgetHint[];
  onQueued?: (tx: QueuedTransaction) => void;
  onSynced?: () => void;
  accounts?: { id: string; name: string; kind: string }[];
  salary?: SalaryHint | null;
  nextPayday?: string;
}) {
  const params = useSearchParams();
  const [income, setIncome] = useState(false);
  const [isSalary, setIsSalary] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Comida");
  const [method, setMethod] = useState<PaymentMethod>("debito");
  const [installments, setInstallments] = useState(1);
  const [owedBy, setOwedBy] = useState("");
  const [owed, setOwed] = useState(0);
  const [later, setLater] = useState(false);
  const [laterDate, setLaterDate] = useState(nextPayday ?? "");
  const [repeat, setRepeat] = useState(false);
  const [every, setEvery] = useState(1);
  const [budgetMsg, setBudgetMsg] = useState<{ text: string; tone: "good" | "warn" | "bad" } | null>(null);
  const [spentExtra, setSpentExtra] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const needsAccount = accounts.length > 0 && !later;
  const payable = accounts.filter((a) => (income ? a.kind !== "tarjeta" : true));

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

  function toggleSalary(on: boolean) {
    setIsSalary(on);
    if (on && salary) {
      setAmount(salary.amountCents);
      setDescription(`Sueldo ${monthLabel(salary.period)}`);
    } else if (!on) {
      setAmount(0);
      setDescription("");
    }
    setFormKey((k) => k + 1); // reinicia el input de monto con el valor precargado
  }

  /** Después de guardar un gasto: cuánto queda del presupuesto de esa categoría. */
  function budgetFeedback(cat: string, cents: number) {
    const b = budgets.find((x) => x.category === cat);
    if (!b || b.limitCents <= 0) return setBudgetMsg(null);
    const spent = b.spentCents + (spentExtra[cat] ?? 0) + cents;
    setSpentExtra((m) => ({ ...m, [cat]: (m[cat] ?? 0) + cents }));
    const left = b.limitCents - spent;
    const pct = Math.round((spent / b.limitCents) * 100);
    setBudgetMsg(
      left < 0
        ? { text: `Te pasaste ${formatARS(-left)} del presupuesto de ${cat}.`, tone: "bad" }
        : pct >= 80
          ? { text: `Ojo: ya usaste el ${pct} % de ${cat}. Te quedan ${formatARS(left)}.`, tone: "warn" }
          : { text: `${cat}: te quedan ${formatARS(left)} este mes.`, tone: "good" },
    );
  }

  function reset(msg: string) {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2200);
    setAmount(0);
    setDescription("");
    setOwedBy("");
    setOwed(0);
    setIsSalary(false);
    setLater(false);
    setRepeat(false);
    setEvery(1);
    setFormKey((k) => k + 1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (amount <= 0) return;
    if (needsAccount && !accountId) return setError(income ? "Elegí en qué cuenta entró la plata." : "Elegí de qué cuenta salió la plata.");
    try {
      localStorage.setItem(LAST_ACCOUNT, accountId);
    } catch {
      /* sin almacenamiento */
    }

    // Gasto fijo o "lo pago más adelante": queda como vencimiento en Servicios.
    if (!income && (later || repeat)) {
      const label = description.trim() || category;
      const due = later ? laterDate || todayAR() : todayAR();
      setBusy(true);
      const r = await send<{ id: string }>("/api/bills", "POST", {
        provider: "OTRO",
        providerLabel: label,
        billingPeriod: due.slice(0, 7),
        dueDate: due,
        amountCents: amount,
        recurring: repeat,
        recurrenceMonths: repeat ? every : 1,
        category,
      });
      if (r.ok && !later) {
        const paid = await send(`/api/bills/${r.data.id}`, "PATCH", { paid: true, accountId: accountId || null, amountCents: amount });
        if (!paid.ok) setError(paid.error);
      }
      setBusy(false);
      if (!r.ok) return setError(r.error);
      onSynced?.();
      if (!later) budgetFeedback(category, amount);
      return reset(later ? `Anotado para pagar el ${dateLabel(due)}` : "Guardado. Te lo recuerdo antes del próximo vencimiento.");
    }

    const tx: QueuedTransaction = {
      clientId: crypto.randomUUID(),
      queuedAt: new Date().toISOString(),
      date: todayAR(),
      amountCents: amount,
      isIncome: income,
      paymentMethod: income ? "transferencia" : method,
      installmentsCount: !income && method === "cuotas" ? installments : 1,
      description: description || (income ? (isSalary ? "Sueldo" : "Ingreso") : category),
      item: description || null,
      owedByName: !income && owedBy ? owedBy : null,
      owedCents: !income && owedBy ? owed : 0,
      category: income ? (isSalary ? "Sueldo" : "Ingresos") : category,
      accountId: accountId || null,
      notes: null,
      salaryPeriod: income && isSalary && salary ? salary.period : null,
    };
    enqueue(tx);
    onQueued?.(tx);
    setPending(await flushQueue());
    onSynced?.();
    if (!income) budgetFeedback(category, amount - (tx.owedCents ?? 0));
    else setBudgetMsg(null);
    reset("Guardado");
  }

  return (
    <Card id="nuevo" className={params.get("nuevo") ? "ring-2 ring-accent/30" : ""}>
      <CardHeader>
        <div className="flex items-center gap-1 rounded-xl bg-surface-muted p-1 text-sm">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => {
                setIncome(v);
                setIsSalary(false);
                setError(null);
              }}
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
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {income && (
          <label className="col-span-2 flex items-center gap-2 rounded-xl bg-surface-muted px-3 py-2.5 text-sm sm:col-span-4">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={isSalary} onChange={(e) => toggleSalary(e.target.checked)} />
            <span>
              Es mi sueldo
              {isSalary && salary && (
                <span className="block text-[11px] text-ink-3">
                  Te precargué el estimado de {monthLabel(salary.period)} ({formatARS(salary.amountCents)}). Cambialo por lo que te entró de verdad.
                </span>
              )}
              {isSalary && !salary && <span className="block text-[11px] text-ink-3">No tengo un estimado: cargá lo que cobraste.</span>}
            </span>
          </label>
        )}
        <Field label="Monto" className="col-span-2 sm:col-span-1">
          <MoneyInput key={formKey} valueCents={amount} onChange={setAmount} />
        </Field>
        <Field label="Detalle" className="col-span-2 sm:col-span-1">
          <Input
            key={`d${formKey}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={income ? "Ej. Sueldo, venta, reintegro" : "Ej. Supermercado, gimnasio"}
          />
        </Field>
        {!income && (
          <>
            <Field label="Categoría">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Medio de pago">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} disabled={later || repeat}>
                <option value="contado">Efectivo</option>
                <option value="debito">Débito</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta (1 pago)</option>
                <option value="cuotas">Tarjeta en cuotas</option>
              </Select>
            </Field>
            {method === "cuotas" && !later && !repeat && (
              <Field label="Cuotas" hint={amount ? `${formatARS(Math.round(amount / installments))} c/u` : undefined}>
                <Input
                  type="number"
                  min={2}
                  max={60}
                  value={installments}
                  onChange={(e) => setInstallments(Math.max(2, Number(e.target.value) || 2))}
                />
              </Field>
            )}
            <div className="col-span-2 grid gap-2 sm:col-span-4 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2.5 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={later} onChange={(e) => setLater(e.target.checked)} />
                <span>
                  Lo pago más adelante
                  <span className="block text-[11px] text-ink-3">Queda como vencimiento y no te descuenta plata hoy.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2.5 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                <span>
                  Se repite todos los meses
                  <span className="block text-[11px] text-ink-3">Gasto fijo (gimnasio, suscripción, seguro): te lo recuerdo y ajustás el monto al pagarlo.</span>
                </span>
              </label>
            </div>
            {repeat && (
              <Field label="¿Cada cuánto?">
                <Select value={every} onChange={(e) => setEvery(Number(e.target.value))}>
                  {FREQUENCIES.map((f) => (
                    <option key={f.months} value={f.months}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {later && (
              <Field label="¿Cuándo lo pagás?" hint={nextPayday ? `Tu próximo cobro es el ${dateLabel(nextPayday)}.` : undefined}>
                <Input type="date" value={laterDate} min={todayAR()} onChange={(e) => setLaterDate(e.target.value)} />
              </Field>
            )}
            {!later && !repeat && (
              <>
                <Field label="¿Te deben una parte?" hint="Nombre (opcional)">
                  <Input value={owedBy} onChange={(e) => setOwedBy(e.target.value)} placeholder="Ej. Juan" />
                </Field>
                {owedBy && (
                  <Field label="Monto a recuperar">
                    <MoneyInput valueCents={owed} onChange={setOwed} />
                  </Field>
                )}
              </>
            )}
          </>
        )}
        {accounts.length > 0 && !later && (
          <Field label={income ? "¿En qué cuenta entró?" : "¿De qué cuenta salió?"} className="col-span-2 sm:col-span-1">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required aria-invalid={Boolean(error) && !accountId}>
              <option value="" disabled>
                Elegí una cuenta
              </option>
              {payable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-4">
          <Button type="submit" variant="accent" className="w-full sm:w-auto" disabled={amount <= 0 || busy}>
            {saved ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {saved ? "Guardado" : income ? (isSalary ? "Guardar sueldo" : "Guardar ingreso") : later ? "Anotar vencimiento" : "Guardar gasto"}
          </Button>
          {saved && saved !== "Guardado" && <span className="text-xs text-good">{saved}</span>}
          {error && <span className="text-xs text-bad">{error}</span>}
          {budgetMsg && !error && (
            <span className={`w-full text-xs ${budgetMsg.tone === "bad" ? "text-bad" : budgetMsg.tone === "warn" ? "text-warn" : "text-ink-3"}`}>{budgetMsg.text}</span>
          )}
        </div>
      </form>
    </Card>
  );
}
