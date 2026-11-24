"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { MoneyInput } from "./money-input";
import { classifyDue, DUE_BUCKET_LABEL } from "@/lib/finance/deadlines";
import { formatARS } from "@/lib/finance/money";
import { dateLabel, monthLabel } from "@/lib/labels";
import { send } from "@/lib/client-api";
import type { BillView } from "@/lib/data/context";

const TONE = { paid: "good", overdue: "bad", today: "bad", next3: "warn", week: "accent", later: "neutral" } as const;
type Account = { id: string; name: string; kind: string };

export function BillsList({
  bills,
  today,
  anomalies,
  canSave,
  accounts = [],
}: {
  bills: BillView[];
  today: string;
  anomalies: Record<string, string>;
  canSave: boolean;
  accounts?: Account[];
}) {
  const router = useRouter();
  const [paying, setPaying] = useState<BillView | null>(null);
  const [editing, setEditing] = useState<BillView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function unpay(b: BillView) {
    setBusy(b.id);
    const r = await send(`/api/bills/${b.id}`, "PATCH", { paid: false });
    setBusy(null);
    if (r.ok) router.refresh();
    else setError(r.error);
  }

  if (bills.length === 0) return <p className="text-sm text-ink-3">No hay vencimientos. Subí una boleta o agregá uno a mano.</p>;

  return (
    <>
      <ul className="divide-y divide-border">
        {bills.map((b) => {
          const bucket = classifyDue(b.dueDate, today, b.paid);
          return (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
              <div className="min-w-0 flex-1 basis-40">
                <p className="flex items-center gap-1.5 font-medium">
                  {b.label}
                  {b.recurring && <Repeat className="h-3 w-3 text-ink-3" aria-label="Se repite todos los meses" />}
                </p>
                <p className="text-[11px] text-ink-3">
                  {monthLabel(b.period)} · vence {dateLabel(b.dueDate)}
                </p>
                {anomalies[b.id] && <p className="mt-1 text-[11px] text-warn">{anomalies[b.id]}</p>}
              </div>
              <Badge tone={TONE[bucket]}>{DUE_BUCKET_LABEL[bucket]}</Badge>
              <span className="num w-24 text-right font-medium">{formatARS(b.amountCents)}</span>
              {b.documentId && (
                <a href={`/api/documents/${b.documentId}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-accent hover:underline" title="Ver el original">
                  <FileText className="h-3.5 w-3.5" /> Original
                </a>
              )}
              {canSave && (
                <span className="flex items-center gap-1">
                  {b.paid ? (
                    <Button variant="ghost" size="sm" disabled={busy === b.id} onClick={() => unpay(b)}>
                      Desmarcar
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setPaying(b)}>
                      <Check className="h-3.5 w-3.5" /> Pagar
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" aria-label={`Editar ${b.label}`} onClick={() => setEditing(b)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      {paying && <PayBill bill={paying} accounts={accounts} today={today} onClose={() => setPaying(null)} />}
      {editing && <BillEditor bill={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Pagar: cuánto fue (si cambió) y de qué cuenta salió. */
function PayBill({ bill, accounts, today, onClose }: { bill: BillView; accounts: Account[]; today: string; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState(bill.amountCents);
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (amount <= 0) return setError("Poné el monto que pagaste.");
    if (accounts.length && !accountId) return setError("Elegí de qué cuenta salió la plata.");
    setBusy(true);
    const r = await send(`/api/bills/${bill.id}`, "PATCH", { paid: true, amountCents: amount, accountId: accountId || null, date });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  return (
    <Dialog title={`Pagar ${bill.label}`} onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Monto pagado" hint={bill.recurring ? "Si este mes fue distinto, cambialo: el próximo se precarga con este monto." : undefined}>
          <MoneyInput valueCents={amount} onChange={setAmount} />
        </Field>
        {accounts.length > 0 && (
          <Field label="¿De qué cuenta salió?">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="" disabled>
                Elegí una cuenta
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Fecha de pago">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
      <Button className="mt-5" disabled={busy} onClick={pay}>
        <Check className="h-4 w-4" /> Marcar pagada
      </Button>
    </Dialog>
  );
}

/** Editar monto, vencimiento o si se repite; o borrar. */
function BillEditor({ bill, onClose }: { bill: BillView; onClose: () => void }) {
  const router = useRouter();
  const [label, setLabel] = useState(bill.label);
  const [amount, setAmount] = useState(bill.amountCents);
  const [dueDate, setDueDate] = useState(bill.dueDate);
  const [recurring, setRecurring] = useState(bill.recurring);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const custom = bill.provider === "OTRO";

  async function save() {
    if (amount <= 0) return setError("Poné un monto.");
    setBusy(true);
    const r = await send(`/api/bills/${bill.id}`, "PATCH", {
      amountCents: amount,
      dueDate,
      billingPeriod: custom ? dueDate.slice(0, 7) : undefined,
      recurring,
      ...(custom ? { providerLabel: label.trim() || null } : {}),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`¿Borrar "${bill.label}" de ${monthLabel(bill.period)}?${bill.paid ? " También se borra el pago y la plata vuelve a la cuenta." : ""}`)) return;
    setBusy(true);
    const r = await send(`/api/bills/${bill.id}`, "DELETE");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  return (
    <Dialog title="Editar vencimiento" onClose={onClose}>
      <div className="grid gap-3">
        {custom && (
          <Field label="Nombre">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
          </Field>
        )}
        <Field label="Monto">
          <MoneyInput valueCents={amount} onChange={setAmount} />
        </Field>
        <Field label="Vence">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          Se repite todos los meses
        </label>
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

/** Alta a mano de un vencimiento o gasto fijo (gimnasio, cuota del club, seguro…). */
export function NewBillForm({ canSave, today }: { canSave: boolean; today: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [dueDate, setDueDate] = useState(today);
  const [recurring, setRecurring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || amount <= 0) return setError("Poné un nombre y un monto.");
    setBusy(true);
    setError(null);
    const r = await send("/api/bills", "POST", {
      provider: "OTRO",
      providerLabel: label.trim(),
      billingPeriod: dueDate.slice(0, 7),
      dueDate,
      amountCents: amount,
      recurring,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setLabel("");
    setAmount(0);
    setN((x) => x + 1);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Agregar vencimiento</CardTitle>
          <CardDescription>Para gastos fijos sin boleta (gimnasio, cuota, seguro) o algo que pagás más adelante.</CardDescription>
        </div>
      </CardHeader>
      <form onSubmit={save} className="grid gap-3">
        <Field label="Nombre">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej. Gimnasio" maxLength={80} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto (aprox.)">
            <MoneyInput key={n} valueCents={0} onChange={setAmount} />
          </Field>
          <Field label="Vence">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          Se repite todos los meses
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!canSave || busy}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
          {error && <span className="text-xs text-bad">{error}</span>}
        </div>
      </form>
    </Card>
  );
}
