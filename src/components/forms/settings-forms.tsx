"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { MoneyInput, PctInput } from "./money-input";
import { send } from "@/lib/client-api";
import { categoryLabel, COMMERCE_CATEGORIES, dateLabel, monthLabel } from "@/lib/labels";
import { formatARS, formatPct } from "@/lib/finance/money";
import type { AppSettings, PayrollProfile } from "@/lib/data/repository";
import type { ScaleEntry } from "@/lib/finance/commerce-union";
import type { IndexData } from "@/lib/finance/rent-adjustment";

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(url: string, method: string, body: unknown, okText = "Guardado.") {
    setBusy(true);
    setMsg(null);
    const r = await send<{ errors?: string[] }>(url, method, body);
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.error });
      return null;
    }
    setMsg({ ok: true, text: okText });
    router.refresh();
    return r.data;
  }
  return { busy, msg, setMsg, run };
}

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <span className={`text-xs ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</span>;
}

const NoDb = ({ canSave }: { canSave: boolean }) => (canSave ? null : <span className="text-xs text-ink-3">Conectá la base de datos para guardar.</span>);

/* ───────────── Ajustes generales ───────────── */

export function SettingsForm({ initial, canSave }: { initial: AppSettings; canSave: boolean }) {
  const [v, setV] = useState(initial);
  const [manualIncome, setManualIncome] = useState(initial.netIncomeCents !== null);
  const { busy, msg, run } = useSave();
  const set = <K extends keyof AppSettings>(k: K, val: AppSettings[K]) => setV((x) => ({ ...x, [k]: val }));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Supuestos y saldo</CardTitle>
          <CardDescription>Se usan para proyectar el flujo de caja, comparar cuotas y calcular cuánto podés gastar.</CardDescription>
        </div>
      </CardHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Inflación mensual esperada" hint="Para proyectar servicios, gastos y alquiler cuando falta el índice.">
          <PctInput value={v.monthlyInflation} onChange={(r) => set("monthlyInflation", r)} />
        </Field>
        <Field label="Rendimiento alternativo mensual" hint="Plazo fijo o FCI: costo de oportunidad de pagar de contado.">
          <PctInput value={v.monthlyAlternativeRate} onChange={(r) => set("monthlyAlternativeRate", r)} />
        </Field>
        <Field label="Saldo actual" hint="Lo que tenés hoy en cuentas y efectivo.">
          <MoneyInput valueCents={v.openingBalanceCents} onChange={(c) => set("openingBalanceCents", c)} />
        </Field>
        <Field label="Saldo mínimo deseado" hint="El flujo de caja avisa si un mes queda por debajo.">
          <MoneyInput valueCents={v.minBalanceCents} onChange={(c) => set("minBalanceCents", c)} />
        </Field>
        <Field label="Colchón mensual" hint="Se descuenta de lo que podés gastar.">
          <MoneyInput valueCents={v.bufferCents} onChange={(c) => set("bufferCents", c)} />
        </Field>
        <Field label="Sueldo neto" hint={manualIncome ? "Tiene prioridad sobre recibos y estimaciones." : "Se toma del último recibo o de la estimación por convenio."}>
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={manualIncome}
              onChange={(e) => {
                setManualIncome(e.target.checked);
                set("netIncomeCents", e.target.checked ? (v.netIncomeCents ?? 0) : null);
              }}
            />
            Cargarlo a mano
          </label>
          {manualIncome && <MoneyInput valueCents={v.netIncomeCents ?? 0} onChange={(c) => set("netIncomeCents", c)} />}
        </Field>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Button disabled={!canSave || busy} onClick={() => run("/api/settings", "PUT", v)}>
          Guardar
        </Button>
        <NoDb canSave={canSave} />
        <Status msg={msg} />
      </div>
    </Card>
  );
}

/* ───────────── Perfil laboral ───────────── */

export function PayrollProfileForm({ initial, canSave }: { initial: PayrollProfile | null; canSave: boolean }) {
  const [category, setCategory] = useState<string>(initial?.category ?? "AUXILIAR_C");
  const [hireDate, setHireDate] = useState(initial?.hireDate ?? "");
  const [hours, setHours] = useState(initial?.weeklyHours ?? 48);
  const { busy, msg, setMsg, run } = useSave();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Tu puesto</CardTitle>
          <CardDescription>Para estimar el sueldo con la escala vigente (antigüedad según fecha de ingreso).</CardDescription>
        </div>
      </CardHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Categoría">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {COMMERCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha de ingreso">
          <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
        </Field>
        <Field label="Horas semanales">
          <Input type="number" min={1} max={48} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
        </Field>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Button
          disabled={!canSave || busy}
          onClick={() => {
            if (!hireDate) return setMsg({ ok: false, text: "Falta la fecha de ingreso." });
            run("/api/payroll/profile", "PUT", { category, hireDate, weeklyHours: hours, configOverrides: initial?.configOverrides ?? null });
          }}
        >
          Guardar
        </Button>
        <NoDb canSave={canSave} />
        <Status msg={msg} />
      </div>
    </Card>
  );
}

/* ───────────── Escalas del convenio ───────────── */

export function ScalesManager({ scales, canSave, defaultCategory }: { scales: (ScaleEntry & { id?: string })[]; canSave: boolean; defaultCategory?: string }) {
  const [category, setCategory] = useState<string>(defaultCategory ?? "AUXILIAR_C");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [basic, setBasic] = useState(0);
  const [nonRem, setNonRem] = useState(0);
  const [source, setSource] = useState("");
  const [n, setN] = useState(0);
  const { busy, msg, setMsg, run } = useSave();

  async function add() {
    if (!validFrom || basic <= 0) return setMsg({ ok: false, text: "Completá vigencia desde y básico." });
    const ok = await run("/api/payroll/scales", "POST", {
      category,
      validFrom,
      validTo: validTo || null,
      basicCents: basic,
      nonRemunerativeCents: nonRem,
      source: source || undefined,
    });
    if (ok) {
      setBasic(0);
      setNonRem(0);
      setN((x) => x + 1);
    }
  }

  return (
    <Card id="escalas">
      <CardHeader>
        <div>
          <CardTitle>Escalas del convenio (CCT 130/75)</CardTitle>
          <CardDescription>Cargá los básicos y sumas no remunerativas de cada acuerdo con su vigencia. Verificalos contra la escala oficial.</CardDescription>
        </div>
      </CardHeader>

      {scales.length === 0 ? (
        <p className="mb-4 text-sm text-ink-3">Todavía no cargaste escalas.</p>
      ) : (
        <div className="mb-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-[11px] text-ink-3">
                <th className="py-1 font-normal">Categoría</th>
                <th className="py-1 font-normal">Vigencia</th>
                <th className="py-1 text-right font-normal">Básico</th>
                <th className="py-1 text-right font-normal">No remun.</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {scales.map((s) => (
                <tr key={s.id ?? `${s.category}-${s.validFrom}`}>
                  <td className="py-2">{categoryLabel(s.category)}</td>
                  <td className="py-2 text-ink-2">
                    {dateLabel(s.validFrom)} {s.validTo ? `al ${dateLabel(s.validTo)}` : "en adelante"}
                  </td>
                  <td className="num py-2 text-right">{formatARS(s.basicCents)}</td>
                  <td className="num py-2 text-right">{formatARS(s.nonRemunerativeCents)}</td>
                  <td className="py-2 pl-2 text-right">
                    {canSave && s.id && (
                      <Button variant="ghost" size="sm" aria-label="Borrar" disabled={busy} onClick={() => run(`/api/payroll/scales/${s.id}`, "DELETE", undefined, "Borrada.")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Categoría">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {COMMERCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vigente desde">
          <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </Field>
        <Field label="Hasta (opcional)">
          <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </Field>
        <Field label="Básico mensual">
          <MoneyInput key={`b${n}`} valueCents={0} onChange={setBasic} />
        </Field>
        <Field label="Suma no remunerativa">
          <MoneyInput key={`n${n}`} valueCents={0} onChange={setNonRem} />
        </Field>
        <Field label="Fuente (opcional)">
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Acuerdo FAECYS …" />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button disabled={!canSave || busy} onClick={add}>
          Agregar escala
        </Button>
        <NoDb canSave={canSave} />
        <Status msg={msg} />
      </div>
    </Card>
  );
}

/* ───────────── Índices ICL / IPC ───────────── */

export function IndicesManager({ indices, canSave }: { indices: IndexData; canSave: boolean }) {
  const [type, setType] = useState<"ICL" | "IPC">("IPC");
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const { busy, msg, setMsg, run } = useSave();
  const icl = indices.icl ?? [];
  const ipc = indices.ipc ?? [];

  async function save() {
    if (!text.trim()) return setMsg({ ok: false, text: "Pegá al menos una línea." });
    const r = await run("/api/indices", "POST", { indexType: type, text, source: source || undefined });
    if (r) {
      const errs = r.errors ?? [];
      setMsg({ ok: errs.length === 0, text: errs.length ? `Guardado, pero se saltearon ${errs.length} líneas: ${errs.slice(0, 2).join(" · ")}` : "Guardado." });
      if (!errs.length) setText("");
    }
  }

  return (
    <Card id="indices">
      <CardHeader>
        <div>
          <CardTitle>Índices para el alquiler</CardTitle>
          <CardDescription>ICL (BCRA, diario) e IPC (INDEC, mensual). Copialos de la fuente oficial y pegalos acá.</CardDescription>
        </div>
      </CardHeader>

      <div className="mb-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-surface-muted p-3">
          <p className="text-xs text-ink-3">ICL cargados</p>
          <p className="font-medium">{icl.length ? `${icl.length} valores · último ${dateLabel(icl[icl.length - 1].date)}: ${icl[icl.length - 1].value}` : "Ninguno"}</p>
        </div>
        <div className="rounded-xl bg-surface-muted p-3">
          <p className="text-xs text-ink-3">IPC cargados</p>
          <p className="font-medium">
            {ipc.length ? `${ipc.length} meses · último ${monthLabel(ipc[ipc.length - 1].month)}: ${formatPct(ipc[ipc.length - 1].rate)}` : "Ninguno"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="Índice">
          <Select value={type} onChange={(e) => setType(e.target.value as "ICL" | "IPC")}>
            <option value="IPC">IPC (variación mensual %)</option>
            <option value="ICL">ICL (valor diario)</option>
          </Select>
        </Field>
        <Field label="Fuente (opcional)">
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder={type === "IPC" ? "INDEC" : "BCRA"} />
        </Field>
      </div>
      <Field
        className="mt-3"
        label="Valores"
        hint={type === "IPC" ? "Una línea por mes: 2026-10;2,3  (el número es el % mensual)" : "Una línea por día: 2026-11-01;24,58  (también 01/11/2026)"}
      >
        <textarea
          className="min-h-32 w-full rounded-xl border border-border bg-surface p-3 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={type === "IPC" ? "2026-09;2,1\n2026-10;2,3" : "2026-11-01;24,58\n2026-11-02;24,61"}
        />
      </Field>
      <div className="mt-4 flex items-center gap-3">
        <Button disabled={!canSave || busy} onClick={save}>
          Guardar valores
        </Button>
        <NoDb canSave={canSave} />
        <Status msg={msg} />
      </div>
    </Card>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
    >
      Cerrar sesión
    </Button>
  );
}
