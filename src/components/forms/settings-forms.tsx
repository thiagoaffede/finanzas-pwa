"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2 } from "lucide-react";
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
import type { IndicesSyncResult } from "@/lib/market/official-indices";
import type { ScalesSyncResult } from "@/lib/market/faecys-sync";

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

export function SettingsForm({ initial, canSave, usesAccounts = false }: { initial: AppSettings; canSave: boolean; usesAccounts?: boolean }) {
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
        {usesAccounts ? (
          <Field label="Saldo actual" hint="Se calcula con tus cuentas (Movimientos → Cuentas).">
            <a href="/movimientos#cuentas" className="flex h-10 items-center text-sm text-accent hover:underline">
              Ver cuentas
            </a>
          </Field>
        ) : (
          <Field label="Saldo actual" hint="Lo que tenés hoy en cuentas y efectivo. O cargá tus cuentas en Movimientos.">
            <MoneyInput valueCents={v.openingBalanceCents} onChange={(c) => set("openingBalanceCents", c)} />
          </Field>
        )}
        <Field label="Saldo mínimo deseado" hint="El flujo de caja avisa si un mes queda por debajo.">
          <MoneyInput valueCents={v.minBalanceCents} onChange={(c) => set("minBalanceCents", c)} />
        </Field>
        <Field label="Día de cobro" hint="Día hábil del mes en que te depositan el sueldo (sin fines de semana ni feriados).">
          <Select value={v.paydayBusinessDay} onChange={(e) => set("paydayBusinessDay", Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n}.º día hábil
              </option>
            ))}
          </Select>
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
          <CardDescription>
            Para estimar el sueldo con la escala vigente. La fecha de ingreso define la antigüedad, el primer sueldo proporcional y el aguinaldo.
          </CardDescription>
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

const syncTime = (iso: string) => new Date(iso).toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" });

export function ScalesManager({
  scales,
  canSave,
  defaultCategory,
  sync,
}: {
  scales: (ScaleEntry & { id?: string })[];
  canSave: boolean;
  defaultCategory?: string;
  sync: ScalesSyncResult | null;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<string>(defaultCategory ?? "AUXILIAR_C");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [basic, setBasic] = useState(0);
  const [nonRem, setNonRem] = useState(0);
  const [source, setSource] = useState("");
  const [n, setN] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { busy, msg, setMsg, run } = useSave();
  const shown = scales.filter((s) => s.category === category).sort((a, b) => a.validFrom.localeCompare(b.validFrom));

  async function syncNow() {
    setSyncing(true);
    setSyncMsg(null);
    const r = await send<ScalesSyncResult>("/api/payroll/scales/sync", "POST", {});
    setSyncing(false);
    if (!r.ok) return setSyncMsg({ ok: false, text: r.error });
    setSyncMsg({ ok: true, text: `Listo: ${r.data.categories} categorías, de ${monthLabel(r.data.from ?? "")} a ${monthLabel(r.data.to ?? "")}.` });
    router.refresh();
  }

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
          <CardDescription>Se cargan solas desde la circular de escalas que publica FAECYS después de cada acuerdo paritario. La app la revisa todos los días.</CardDescription>
        </div>
      </CardHeader>

      <div className="mb-4 rounded-xl bg-surface-muted p-3 text-sm">
        {sync?.title ? (
          <>
            <p className="text-xs text-ink-3">Circular cargada</p>
            <p className="font-medium">
              {sync.link ? (
                <a href={sync.link} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                  {sync.title}
                </a>
              ) : (
                sync.title
              )}
            </p>
            {sync.from && sync.to && (
              <p className="text-[11px] text-ink-3">
                {sync.agreement ? `Acuerdo ${sync.agreement} · ` : ""}de {monthLabel(sync.from)} a {monthLabel(sync.to)} · {sync.categories} categorías
              </p>
            )}
          </>
        ) : (
          <p className="text-ink-3">Todavía no se leyó ninguna circular.</p>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={!canSave || syncing} onClick={syncNow}>
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Actualizando…" : "Actualizar ahora"}
        </Button>
        <span className="text-xs text-ink-3">{sync ? `Última revisión: ${syncTime(sync.at)}` : ""}</span>
        {syncMsg ? <Status msg={syncMsg} /> : sync && !sync.ok && sync.error && <span className="text-xs text-bad">No se pudo revisar FAECYS: {sync.error}</span>}
      </div>

      <Field label="Categoría" className="mb-3 max-w-xs">
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          {COMMERCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </Select>
      </Field>

      {shown.length === 0 ? (
        <p className="mb-4 text-sm text-ink-3">No hay escalas de {categoryLabel(category)}.</p>
      ) : (
        <table className="mb-5 w-full text-xs sm:text-sm">
          <thead>
            <tr className="text-left text-[11px] text-ink-3">
              <th className="py-1 font-normal">Mes</th>
              <th className="py-1 pl-2 text-right font-normal">Básico</th>
              <th className="py-1 pl-2 text-right font-normal">No rem.</th>
              <th className="py-1 pl-2 text-right font-normal">Única vez</th>
              {canSave && <th className="hidden w-8 sm:table-cell" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((s) => (
              <tr key={s.id ?? `${s.category}-${s.validFrom}`} title={s.source}>
                <td className="py-2 pr-1 text-ink-2">
                  {s.validTo && s.validFrom.slice(0, 7) === s.validTo.slice(0, 7) && s.validFrom.endsWith("-01")
                    ? monthLabel(s.validFrom.slice(0, 7))
                    : s.validTo
                      ? `${dateLabel(s.validFrom)} al ${dateLabel(s.validTo)}`
                      : `desde ${s.validFrom.endsWith("-01") ? monthLabel(s.validFrom.slice(0, 7)) : dateLabel(s.validFrom)}`}
                </td>
                <td className="num whitespace-nowrap py-2 pl-2 text-right">{formatARS(s.basicCents)}</td>
                <td className="num whitespace-nowrap py-2 pl-2 text-right">{s.nonRemunerativeCents ? formatARS(s.nonRemunerativeCents) : "—"}</td>
                <td className="num whitespace-nowrap py-2 pl-2 text-right">{s.oneTimeNonRemunerativeCents ? formatARS(s.oneTimeNonRemunerativeCents) : "—"}</td>
                {canSave && (
                  <td className="hidden py-1 pl-1 text-right sm:table-cell">
                    {s.id && (
                      <Button variant="ghost" size="sm" aria-label="Borrar" disabled={busy} onClick={() => run(`/api/payroll/scales/${s.id}`, "DELETE", undefined, "Borrada.")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details>
        <summary className="cursor-pointer text-sm font-medium text-ink-2">Cargar una escala a mano</summary>
        <p className="mt-2 mb-3 text-xs text-ink-3">Para la categoría elegida arriba. Si después sale una circular con el mismo mes, la pisa.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Vigente desde">
            <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </Field>
          <Field label="Hasta (opcional)">
            <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </Field>
          <Field label="Fuente (opcional)">
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Acuerdo FAECYS …" />
          </Field>
          <Field label="Básico mensual">
            <MoneyInput key={`b${n}`} valueCents={0} onChange={setBasic} />
          </Field>
          <Field label="Suma no remunerativa">
            <MoneyInput key={`n${n}`} valueCents={0} onChange={setNonRem} />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button disabled={!canSave || busy} onClick={add}>
            Agregar escala
          </Button>
          <NoDb canSave={canSave} />
          <Status msg={msg} />
        </div>
      </details>
    </Card>
  );
}

/* ───────────── Índices ICL / IPC ───────────── */

export function IndicesManager({ indices, canSave, sync }: { indices: IndexData; canSave: boolean; sync: IndicesSyncResult | null }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [type, setType] = useState<"ICL" | "IPC">("IPC");
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const { busy, msg, setMsg, run } = useSave();
  const icl = indices.icl ?? [];
  const ipc = indices.ipc ?? [];

  async function syncNow() {
    setSyncing(true);
    setSyncMsg(null);
    const r = await send<IndicesSyncResult>("/api/indices/sync", "POST", {});
    setSyncing(false);
    if (!r.ok) return setSyncMsg({ ok: false, text: r.error });
    const errs = [r.data.ipc.error, r.data.icl.error].filter(Boolean);
    const saved = r.data.ipc.saved + r.data.icl.saved;
    setSyncMsg({ ok: errs.length === 0, text: errs.length ? `Se actualizó solo una parte. ${errs.join(" · ")}` : saved ? `Listo: ${saved} valores nuevos.` : "Ya estaba todo al día." });
    router.refresh();
  }

  const syncErrors = sync ? [sync.ipc.error, sync.icl.error].filter(Boolean) : [];

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
          <CardDescription>ICL del BCRA (diario) e IPC del INDEC (mensual). Se actualizan solos todos los días desde las fuentes oficiales.</CardDescription>
        </div>
      </CardHeader>

      <div className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-surface-muted p-3">
          <p className="text-xs text-ink-3">ICL (BCRA)</p>
          <p className="font-medium">{icl.length ? `${dateLabel(icl[icl.length - 1].date)}: ${icl[icl.length - 1].value.toLocaleString("es-AR")}` : "Sin datos"}</p>
          {icl.length > 0 && <p className="text-[11px] text-ink-3">{icl.length} valores diarios</p>}
        </div>
        <div className="rounded-xl bg-surface-muted p-3">
          <p className="text-xs text-ink-3">IPC (INDEC)</p>
          <p className="font-medium">{ipc.length ? `${monthLabel(ipc[ipc.length - 1].month)}: ${formatPct(ipc[ipc.length - 1].rate)}` : "Sin datos"}</p>
          {ipc.length > 0 && <p className="text-[11px] text-ink-3">{ipc.length} meses · el INDEC lo publica a mediados del mes siguiente</p>}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={!canSave || syncing} onClick={syncNow}>
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Actualizando…" : "Actualizar ahora"}
        </Button>
        <span className="text-xs text-ink-3">{sync ? `Última actualización: ${syncTime(sync.at)}` : "Todavía no se actualizaron."}</span>
        {syncMsg ? <Status msg={syncMsg} /> : syncErrors.length > 0 && <span className="text-xs text-bad">{syncErrors.join(" · ")}</span>}
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-ink-2">Cargar valores a mano</summary>
        <p className="mt-2 mb-3 text-xs text-ink-3">Solo si te hace falta un valor que todavía no salió. La próxima actualización pisa los valores de las mismas fechas con los oficiales.</p>
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
      </details>
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
