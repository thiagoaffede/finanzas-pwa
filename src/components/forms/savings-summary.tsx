"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "./money-input";
import { send } from "@/lib/client-api";
import { formatARS, formatUSD } from "@/lib/finance/money";
import type { UsdRate } from "@/lib/market/usd-rate";

const HOUSES = [
  ["bolsa", "MEP"],
  ["oficial", "Oficial"],
  ["blue", "Blue"],
  ["cripto", "Cripto"],
  ["contadoconliqui", "CCL"],
] as const;

/** Total ahorrado: metas en pesos, metas y cuentas en dólares valuadas a la cotización elegida. */
export function SavingsSummary({
  arsCents,
  usdCents,
  usdAccountsCents,
  rate,
  house,
  manualCents,
  canSave,
}: {
  arsCents: number;
  usdCents: number;
  usdAccountsCents: number;
  rate: UsdRate | null;
  house: string;
  manualCents: number | null;
  canSave: boolean;
}) {
  const router = useRouter();
  const [manual, setManual] = useState(manualCents ?? 0);
  const [msg, setMsg] = useState<string | null>(null);
  // Los dólares de las metas en general están guardados en una cuenta en dólares: no se suman dos veces.
  // Si las metas suman más que las cuentas (dólares que no cargaste como cuenta), cuenta la diferencia.
  const usdTotal = Math.max(usdCents, usdAccountsCents);
  const usdFree = usdTotal - usdCents;
  const usdInArs = rate ? Math.round((usdTotal * rate.buyCents) / 100) : null;

  async function save(patch: Record<string, unknown>) {
    setMsg("Guardando…");
    const r = await send("/api/settings", "PUT", patch);
    setMsg(r.ok ? null : r.error);
    if (r.ok) router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Ahorro</CardTitle>
          <CardDescription>Metas en pesos y tus dólares (cuentas y metas, sin contarlos dos veces), valuados al precio de compra del día.</CardDescription>
        </div>
      </CardHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-ink-3">En pesos (metas)</p>
          <p className="num text-lg font-semibold">{formatARS(arsCents)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-3">En dólares</p>
          <p className="num text-lg font-semibold">{formatUSD(usdTotal)}</p>
          {usdInArs !== null && <p className="num text-xs text-ink-3">≈ {formatARS(usdInArs)}</p>}
          {usdCents > 0 && usdTotal > 0 && (
            <p className="num text-[11px] text-ink-3">
              {formatUSD(usdCents)} para metas{usdFree > 0 ? ` · ${formatUSD(usdFree)} libres` : ""}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-ink-3">Total en pesos</p>
          <p className="num text-lg font-semibold">{usdInArs !== null ? formatARS(arsCents + usdInArs) : "—"}</p>
          <p className="text-xs text-ink-3">
            {rate
              ? `Dólar ${rate.name} ${formatARS(rate.buyCents)} (${rate.source}${rate.at ? `, ${new Date(rate.at).toLocaleDateString("es-AR")}` : ""})`
              : "Sin cotización: cargá una a mano abajo."}
          </p>
        </div>
      </div>
      {canSave && (
        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <Field label="Valuar con el dólar">
            <Select value={house} onChange={(e) => save({ usdHouse: e.target.value })}>
              {HOUSES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cotización manual (si no hay conexión)" className="sm:col-span-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <MoneyInput valueCents={manual} onChange={setManual} />
              </div>
              <Button variant="outline" onClick={() => save({ usdManualCents: manual > 0 ? manual : null })}>
                Guardar
              </Button>
            </div>
          </Field>
          {msg && <p className="text-xs text-ink-3 sm:col-span-3">{msg}</p>}
        </div>
      )}
    </Card>
  );
}
