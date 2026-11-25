"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { MoneyInput } from "./money-input";
import { Progress } from "@/components/ui/progress";
import { send } from "@/lib/client-api";
import { formatARS } from "@/lib/finance/money";
import { addMonths } from "@/lib/finance/dates";
import { dateLabel, monthLabel } from "@/lib/labels";
import type { CardPurchase } from "@/lib/data/context";

type CardAccount = { id: string; name: string; closingDay: number | null; dueDay: number | null; balanceCents: number };

type Statement = { card: CardAccount; dueDate: string; amountCents: number; count: number };

/** Próximo resumen impago de cada tarjeta (el de vencimiento más cercano, aunque ya haya vencido). */
function nextStatements(purchases: CardPurchase[], cards: CardAccount[]): Statement[] {
  return cards.flatMap((card) => {
    const byDue = new Map<string, { amountCents: number; count: number }>();
    for (const p of purchases)
      if (p.accountId === card.id)
        for (const q of p.pending) {
          const s = byDue.get(q.dueDate) ?? { amountCents: 0, count: 0 };
          s.amountCents += q.amountCents;
          s.count++;
          byDue.set(q.dueDate, s);
        }
    const first = [...byDue.keys()].sort()[0];
    return first ? [{ card, dueDate: first, ...byDue.get(first)! }] : [];
  });
}

/** Cuotas de tarjeta: cuánto se paga cada mes y qué compras quedan por terminar. */
export function CardInstallments({
  purchases,
  cards,
  month,
  canSave,
  today,
  payFrom = [],
}: {
  purchases: CardPurchase[];
  cards: CardAccount[];
  month: string;
  canSave: boolean;
  today: string;
  payFrom?: { id: string; name: string }[];
}) {
  const [filter, setFilter] = useState<string>("todas");
  const [configuring, setConfiguring] = useState<CardAccount | null>(null);
  const [paying, setPaying] = useState<Statement | null>(null);
  const statements = nextStatements(purchases, cards);
  const shown = purchases.filter((p) => filter === "todas" || p.accountId === filter || (filter === "sin" && !p.accountId));
  const months = Array.from({ length: 12 }, (_, i) => addMonths(month, i));
  const byMonth = months.map((m) => ({
    month: m,
    cents: shown.reduce((s, p) => s + p.pending.filter((q) => q.dueDate.slice(0, 7) === m).reduce((a, q) => a + q.amountCents, 0), 0),
  }));
  const max = Math.max(1, ...byMonth.map((x) => x.cents));
  const remaining = shown.reduce((s, p) => s + p.remainingCents, 0);
  const cardName = new Map(cards.map((c) => [c.id, c.name]));
  const hasUnassigned = purchases.some((p) => !p.accountId);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Cuotas de tarjeta</CardTitle>
          <CardDescription>
            {purchases.length
              ? `Te faltan pagar ${formatARS(remaining)} en cuotas. Así se reparten en los próximos meses.`
              : "Cuando cargues una compra con tarjeta (en 1 pago o en cuotas) vas a ver acá cuánto pagás cada mes."}
          </CardDescription>
        </div>
      </CardHeader>

      {(cards.length > 0 || hasUnassigned) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[{ id: "todas", name: "Todas" }, ...cards, ...(hasUnassigned ? [{ id: "sin", name: "Sin tarjeta" }] : [])].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={`rounded-full border px-3 py-1.5 text-xs ${filter === c.id ? "border-accent bg-accent-soft text-accent" : "border-border text-ink-2"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {cards.length > 0 && (
        <ul className="mb-4 space-y-1 text-[11px] text-ink-3">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {c.name}: {c.closingDay && c.dueDay ? `cierra el ${c.closingDay}, vence el ${c.dueDay}` : "sin cierre cargado (las cuotas se calculan al mes siguiente de la compra)"}
                {c.balanceCents < 0 ? ` · debés ${formatARS(-c.balanceCents)}` : ""}
              </span>
              {canSave && (
                <Button variant="ghost" size="sm" onClick={() => setConfiguring(c)}>
                  <Settings2 className="h-3.5 w-3.5" /> Cierre
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {statements.length > 0 && (
        <ul className="mb-4 space-y-2">
          {statements.map((s) => {
            const overdue = s.dueDate < today;
            return (
              <li key={s.card.id} className={`flex items-center gap-3 rounded-xl p-3 text-sm ${overdue ? "bg-bad-soft" : "bg-surface-muted"}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">Resumen {s.card.name}</p>
                  <p className={`text-[11px] ${overdue ? "text-bad" : "text-ink-3"}`}>
                    {overdue ? "Venció" : "Vence"} el {dateLabel(s.dueDate)} · {s.count} {s.count === 1 ? "cuota" : "cuotas"}
                  </p>
                </div>
                <span className="num font-medium">{formatARS(s.amountCents)}</span>
                {canSave && (
                  <Button size="sm" variant={overdue ? "default" : "outline"} onClick={() => setPaying(s)}>
                    Pagar
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {shown.length > 0 && (
        <>
          <ul className="space-y-1.5">
            {byMonth.map((x) => (
              <li key={x.month} className="grid grid-cols-[4.5rem_1fr_6.5rem] items-center gap-2 text-xs">
                <span className="text-ink-3">{monthLabel(x.month)}</span>
                <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(x.cents / max) * 100}%` }} />
                </div>
                <span className={`num text-right ${x.cents ? "font-medium" : "text-ink-3"}`}>{formatARS(x.cents)}</span>
              </li>
            ))}
          </ul>

          <ul className="mt-5 divide-y divide-border border-t border-border text-sm">
            {[...shown]
              .sort((a, b) => a.lastDue.localeCompare(b.lastDue))
              .map((p) => {
                const next = p.pending[0];
                const paid = p.total - p.pending.length;
                return (
                  <li key={p.transactionId} className="py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate font-medium">{p.description}</p>
                      <span className="num shrink-0 text-xs text-ink-2">{formatARS(next?.amountCents ?? 0)}
                        {p.total > 1 ? " / mes" : ""}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-3">
                      {p.total > 1 ? `${p.total} cuotas de ${formatARS(Math.round(p.purchaseCents / p.total))}` : "1 pago"}
                      {p.accountId && cardName.get(p.accountId) ? ` · ${cardName.get(p.accountId)}` : ""} · termina en {monthLabel(p.lastDue.slice(0, 7))}
                    </p>
                    {p.total > 1 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress value={paid / p.total} className="h-1.5" />
                        <span className="shrink-0 text-[11px] text-ink-3">
                          {paid}/{p.total} · faltan {formatARS(p.remainingCents)}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        </>
      )}
      {configuring && <CardSetup card={configuring} onClose={() => setConfiguring(null)} />}
      {paying && <PayStatement statement={paying} accounts={payFrom} today={today} onClose={() => setPaying(null)} />}
    </Card>
  );
}

function CardSetup({ card, onClose }: { card: CardAccount; onClose: () => void }) {
  const router = useRouter();
  const [closing, setClosing] = useState(card.closingDay ? String(card.closingDay) : "");
  const [due, setDue] = useState(card.dueDay ? String(card.dueDay) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const c = closing ? Number(closing) : null;
    const d = due ? Number(due) : null;
    if ((c && (c < 1 || c > 31)) || (d && (d < 1 || d > 31))) return setError("Los días van del 1 al 31.");
    setBusy(true);
    const r = await send(`/api/accounts/${card.id}`, "PATCH", { closingDay: c, dueDay: d });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
    router.refresh();
  }

  return (
    <Dialog title={`Cierre de ${card.name}`} onClose={onClose}>
      <p className="mb-4 text-xs text-ink-3">
        Lo que comprás hasta el día de cierre entra en el resumen que vence el mes siguiente. Se usa para las compras que cargues de acá en adelante.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Día de cierre">
          <Input type="number" inputMode="numeric" min={1} max={31} value={closing} onChange={(e) => setClosing(e.target.value)} placeholder="Ej. 24" />
        </Field>
        <Field label="Día de vencimiento">
          <Input type="number" inputMode="numeric" min={1} max={31} value={due} onChange={(e) => setDue(e.target.value)} placeholder="Ej. 5" />
        </Field>
      </div>
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
      <Button className="mt-5" disabled={busy} onClick={save}>
        Guardar
      </Button>
    </Dialog>
  );
}

const LAST_PAY_ACCOUNT = "finanzas.lastStatementAccount";

function PayStatement({ statement, accounts, today, onClose }: { statement: Statement; accounts: { id: string; name: string }[]; today: string; onClose: () => void }) {
  const router = useRouter();
  const [from, setFrom] = useState(() => {
    try {
      const saved = localStorage.getItem(LAST_PAY_ACCOUNT);
      if (saved && accounts.some((a) => a.id === saved)) return saved;
    } catch {}
    return accounts[0]?.id ?? "";
  });
  const [amount, setAmount] = useState(statement.amountCents);
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!from) return setError("Elegí de qué cuenta sale la plata.");
    if (amount <= 0) return setError("Poné cuánto pagaste.");
    setBusy(true);
    const r = await send(`/api/accounts/${statement.card.id}/statement`, "POST", { dueDate: statement.dueDate, fromAccountId: from, amountCents: amount, date });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    try {
      localStorage.setItem(LAST_PAY_ACCOUNT, from);
    } catch {}
    onClose();
    router.refresh();
  }

  return (
    <Dialog title={`Pagar resumen ${statement.card.name}`} onClose={onClose}>
      <p className="mb-4 text-xs text-ink-3">
        Vence el {dateLabel(statement.dueDate)}: {statement.count} {statement.count === 1 ? "cuota" : "cuotas"} por {formatARS(statement.amountCents)}. Se registra como una
        transferencia a la tarjeta (no es un gasto nuevo: las compras ya se contaron) y las cuotas quedan pagadas. Si te equivocás, borrá la transferencia en Movimientos.
      </p>
      {accounts.length === 0 ? (
        <p className="text-sm text-bad">Cargá primero la cuenta de donde pagás (banco o billetera) en Configuración.</p>
      ) : (
        <div className="grid gap-3">
          <Field label="Pagás desde">
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto pagado" hint="Si pagaste el total del resumen, dejalo así.">
              <MoneyInput valueCents={amount} onChange={setAmount} />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
      <Button className="mt-5" disabled={busy || accounts.length === 0} onClick={save}>
        Registrar pago
      </Button>
    </Dialog>
  );
}
