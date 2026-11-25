"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { send } from "@/lib/client-api";

const TABLE_LABEL: Record<string, [string, string]> = {
  transactions: ["movimiento", "movimientos"],
  bills: ["servicio o gasto fijo", "servicios y gastos fijos"],
  installments: ["cuota", "cuotas"],
  accounts: ["cuenta", "cuentas"],
  transfers: ["transferencia", "transferencias"],
  goals: ["objetivo", "objetivos"],
  goalContributions: ["aporte a objetivos", "aportes a objetivos"],
  payslips: ["recibo de sueldo", "recibos de sueldo"],
  documents: ["archivo", "archivos"],
  rentContracts: ["contrato de alquiler", "contratos de alquiler"],
  indexValues: ["valor de índice", "valores de índices"],
  settings: ["ajuste", "ajustes"],
};

type Check = { exportedAt: string; withFiles: boolean; counts: Record<string, number> };

/** Bajar el backup completo y restaurarlo (con doble confirmación). */
export function BackupManager({ canSave, lastBackupAt }: { canSave: boolean; lastBackupAt: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [withFiles, setWithFiles] = useState(false);
  const [data, setData] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    setCheck(null);
    setConfirm("");
    setData(null);
    setMsg(null);
    if (!file) return;
    setFileName(file.name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return setMsg({ tone: "bad", text: "Ese archivo no es un backup (no es JSON)." });
    }
    setBusy(true);
    const r = await send<Check>("/api/backup/restore", "POST", parsed);
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setData(parsed);
    setCheck(r.data);
  }

  async function restore() {
    if (!data || confirm.trim().toUpperCase() !== "REEMPLAZAR") return;
    setBusy(true);
    setMsg({ tone: "info", text: "Restaurando… no cierres la app." });
    const r = await send<Check>("/api/backup/restore?confirmar=REEMPLAZAR", "POST", data);
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "ok", text: `Listo: se restauraron ${r.data.counts.transactions ?? 0} movimientos y el resto de tus datos.` });
    setCheck(null);
    setData(null);
    setConfirm("");
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  const summary = check
    ? Object.entries(check.counts)
        .filter(([k, n]) => n > 0 && TABLE_LABEL[k])
        .map(([k, n]) => `${n} ${TABLE_LABEL[k][n === 1 ? 0 : 1]}`)
        .join(", ")
    : "";

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Backup completo</CardTitle>
            <CardDescription>
              Un archivo con todo: movimientos, cuentas, servicios, cuotas, objetivos, sueldo, alquiler y ajustes. Guardalo en Drive o en el mail.
            </CardDescription>
          </div>
        </CardHeader>
        <p className="mb-3 text-xs text-ink-3">
          {lastBackupAt ? `Último backup: ${new Date(lastBackupAt).toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short", hourCycle: "h23" })}` : "Todavía no bajaste ningún backup."}
        </p>
        <label className="mb-4 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} />
          <span>
            Incluir los PDF y fotos de boletas y recibos
            <span className="block text-[11px] text-ink-3">Pesa bastante más. Sin esto, al restaurar se mantienen los archivos que ya están guardados.</span>
          </span>
        </label>
        <Button asChild disabled={!canSave}>
          <a href={`/api/backup${withFiles ? "?archivos=1" : ""}`} aria-disabled={!canSave} className={canSave ? "" : "pointer-events-none opacity-50"} onClick={() => setTimeout(() => router.refresh(), 1500)}>
            <Download className="h-4 w-4" /> Bajar backup
          </a>
        </Button>
        {!canSave && <p className="mt-2 text-xs text-ink-3">Conectá la base de datos para bajar un backup.</p>}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Restaurar un backup</CardTitle>
            <CardDescription>Reemplaza todos los datos actuales por los del archivo. Primero te mostramos qué trae, y no se toca nada hasta que confirmes.</CardDescription>
          </div>
        </CardHeader>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <Button variant="outline" disabled={!canSave || busy} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Elegir archivo
        </Button>
        {fileName && !check && busy && <p className="mt-2 text-xs text-ink-3">Revisando {fileName}…</p>}

        {check && (
          <div className="mt-4 space-y-3 rounded-xl border border-bad/40 bg-bad-soft p-4 text-sm">
            <p className="font-medium text-bad">Vas a reemplazar todo lo que tenés cargado</p>
            <p className="text-ink-2">
              El backup es del {new Date(check.exportedAt).toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short", hourCycle: "h23" })} y trae {summary || "muy pocos datos"}.
              Lo que cargaste después de esa fecha se pierde.
            </p>
            <p className="text-ink-2">
              Antes, bajá un backup de cómo está ahora por si querés volver:{" "}
              <a href="/api/backup" className="font-medium text-accent underline">
                bajar backup actual
              </a>
              .
            </p>
            <Field label='Escribí "REEMPLAZAR" para confirmar'>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" autoComplete="off" placeholder="REEMPLAZAR" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" disabled={busy || confirm.trim().toUpperCase() !== "REEMPLAZAR"} onClick={restore}>
                Restaurar backup
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setCheck(null);
                  setData(null);
                  setConfirm("");
                  setFileName("");
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {msg && <p className={`mt-3 text-sm ${msg.tone === "bad" ? "text-bad" : msg.tone === "ok" ? "text-good" : "text-ink-3"}`}>{msg.text}</p>}
      </Card>
    </>
  );
}

/** Exportar para abrir en Excel o Google Sheets. */
export function ExportCard() {
  const csv = [
    ["transactions", "Movimientos"],
    ["bills", "Servicios"],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Exportar a Excel</CardTitle>
          <CardDescription>Un libro con hojas de movimientos, servicios, cuotas, cuentas, transferencias, objetivos, sueldos y el resumen de cada mes.</CardDescription>
        </div>
      </CardHeader>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a href="/api/export?format=xlsx&what=all">
            <FileSpreadsheet className="h-4 w-4" /> Bajar Excel
          </a>
        </Button>
        {csv.map(([what, label]) => (
          <Button key={what} asChild variant="outline">
            <a href={`/api/export?format=csv&what=${what}`}>
              <Download className="h-4 w-4" /> {label} CSV
            </a>
          </Button>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-ink-3">El CSV usa punto y coma, como el Excel en español. Los importes del Excel van en pesos con decimales.</p>
    </Card>
  );
}
