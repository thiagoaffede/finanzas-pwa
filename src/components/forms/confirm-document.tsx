"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "./money-input";
import { send } from "@/lib/client-api";
import { formatARS } from "@/lib/finance/money";
import { BILL_PROVIDERS, type BillProvider } from "@/types/finance";
import { PROVIDER_NAME } from "@/lib/labels";
import type { PayLine } from "@/lib/finance/commerce-union";

/** Borrador de boleta: editable antes de guardar. También sirve para cargarla a mano. */
export interface BillDraft {
  provider: BillProvider;
  providerLabel?: string | null;
  accountNumber?: string | null;
  billingPeriod: string;
  issueDate?: string | null;
  dueDate: string;
  secondDueDate?: string | null;
  amountCents: number;
}

export function ConfirmBill({ draft, raw, documentId, onDone, onCancel }: { draft: Partial<BillDraft>; raw?: unknown; documentId?: string | null; onDone: () => void; onCancel: () => void }) {
  const [b, setB] = useState<BillDraft>({
    provider: draft.provider ?? "OTRO",
    providerLabel: draft.providerLabel ?? null,
    accountNumber: draft.accountNumber ?? null,
    billingPeriod: draft.billingPeriod ?? "",
    issueDate: draft.issueDate ?? null,
    dueDate: draft.dueDate ?? "",
    secondDueDate: draft.secondDueDate ?? null,
    amountCents: draft.amountCents ?? 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const valid = /^\d{4}-\d{2}$/.test(b.billingPeriod) && /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate) && b.amountCents > 0;

  async function save() {
    setSaving(true);
    const r = await send("/api/bills", "POST", { ...b, status: "pending", rawExtractedJson: raw, sourceDocumentId: documentId ?? null });
    setSaving(false);
    if (r.ok) onDone();
    else setError(r.error);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Servicio">
          <Select value={b.provider} onChange={(e) => setB({ ...b, provider: e.target.value as BillProvider })}>
            {BILL_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_NAME[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Período">
          <Input type="month" value={b.billingPeriod} onChange={(e) => setB({ ...b, billingPeriod: e.target.value })} />
        </Field>
        <Field label="Vencimiento">
          <Input type="date" value={b.dueDate} onChange={(e) => setB({ ...b, dueDate: e.target.value })} />
        </Field>
        <Field label="Monto">
          <MoneyInput valueCents={b.amountCents} onChange={(v) => setB({ ...b, amountCents: v })} />
        </Field>
      </div>
      {error && <p className="text-xs text-bad">{error}</p>}
      <div className="flex gap-2">
        <Button variant="accent" onClick={save} disabled={!valid || saving}>
          {saving ? "Guardando…" : "Confirmar y guardar"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export interface PayslipDraft {
  period: string;
  employer?: string | null;
  paymentDate?: string | null;
  remunerativeCents: number;
  nonRemunerativeCents: number;
  deductionsCents: number;
  netCents: number;
  lines: PayLine[];
}

const sumType = (lines: PayLine[], t: PayLine["type"]) => lines.filter((l) => l.type === t).reduce((s, l) => s + l.amountCents, 0);

export function ConfirmPayslip({ draft, raw, documentId, onDone, onCancel }: { draft: Partial<PayslipDraft>; raw?: unknown; documentId?: string | null; onDone: () => void; onCancel: () => void }) {
  const [period, setPeriod] = useState(draft.period ?? "");
  const [lines, setLines] = useState<PayLine[]>(draft.lines?.length ? draft.lines : [{ code: "", label: "Sueldo básico", type: "rem", amountCents: 0 }]);
  const [net, setNet] = useState(draft.netCents ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rem = sumType(lines, "rem");
  const nonrem = sumType(lines, "nonrem");
  const ded = sumType(lines, "deduction");
  const computedNet = rem + nonrem - ded;
  const netOff = net > 0 && Math.abs(net - computedNet) > 100;
  const valid = /^\d{4}-\d{2}$/.test(period) && net > 0;

  async function save() {
    setSaving(true);
    const r = await send("/api/payroll/payslips", "POST", {
      period,
      employer: draft.employer ?? null,
      paymentDate: draft.paymentDate ?? null,
      remunerativeCents: rem,
      nonRemunerativeCents: nonrem,
      deductionsCents: ded,
      netCents: net,
      lines,
      rawExtractedJson: raw,
      sourceDocumentId: documentId ?? null,
    });
    setSaving(false);
    if (r.ok) onDone();
    else setError(r.error);
  }

  const update = (i: number, patch: Partial<PayLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3">
      <Field label="Período" className="max-w-48">
        <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
      </Field>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_7rem_8rem_2.5rem] items-center gap-2">
            <Input value={l.label} onChange={(e) => update(i, { label: e.target.value })} aria-label="Concepto" />
            <Select value={l.type} onChange={(e) => update(i, { type: e.target.value as PayLine["type"] })} aria-label="Tipo">
              <option value="rem">Remun.</option>
              <option value="nonrem">No rem.</option>
              <option value="deduction">Descuento</option>
            </Select>
            <MoneyInput valueCents={l.amountCents} onChange={(v) => update(i, { amountCents: v })} />
            <Button variant="ghost" size="icon" aria-label="Quitar" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4 text-ink-3" />
            </Button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, { code: "", label: "", type: "rem", amountCents: 0 }])}>
          <Plus className="h-3.5 w-3.5" /> Agregar concepto
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-muted p-3 text-sm sm:grid-cols-4">
        <p>
          <span className="block text-[11px] text-ink-3">Remunerativo</span>
          <span className="num">{formatARS(rem)}</span>
        </p>
        <p>
          <span className="block text-[11px] text-ink-3">No remunerativo</span>
          <span className="num">{formatARS(nonrem)}</span>
        </p>
        <p>
          <span className="block text-[11px] text-ink-3">Descuentos</span>
          <span className="num">{formatARS(ded)}</span>
        </p>
        <Field label="Neto a cobrar">
          <MoneyInput valueCents={net} onChange={setNet} />
        </Field>
      </div>
      {netOff && <p className="text-xs text-warn">El neto no coincide con haberes − descuentos ({formatARS(computedNet)}). Revisá los conceptos.</p>}
      {error && <p className="text-xs text-bad">{error}</p>}
      <div className="flex gap-2">
        <Button variant="accent" onClick={save} disabled={!valid || saving}>
          {saving ? "Guardando…" : "Confirmar y guardar"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
