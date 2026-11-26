"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { send } from "@/lib/client-api";
import type { MoodleSyncResult } from "@/lib/study/moodle-sync";

function syncText(r: MoodleSyncResult) {
  const at = new Date(r.at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
  if (!r.ok) return `Última vez (${at}): ${r.error}`;
  const parts = [`${r.events} fechas en el calendario`];
  if (r.created) parts.push(`${r.created} nuevas`);
  if (r.updated) parts.push(`${r.updated} cambiadas`);
  if (r.removed) parts.push(`${r.removed} borradas`);
  return `Sincronizado ${at}: ${parts.join(", ")}.`;
}

/**
 * Conexión con Moodle sin contraseña: el link privado de "Exportar calendario" (iCal).
 * También se puede subir un archivo .ics.
 */
export function MoodleCard({ masked, sync, canSave }: { masked: string | null; sync: MoodleSyncResult | null; canSave: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function saveUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setMsg(null);
    const r = await send<MoodleSyncResult>("/api/study/moodle", "PUT", { url: url.trim() });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setUrl("");
    setMsg({ ok: r.data.ok, text: syncText(r.data) });
    router.refresh();
  }

  async function syncNow() {
    setBusy(true);
    setMsg(null);
    const r = await send<MoodleSyncResult>("/api/study/moodle", "POST");
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: r.data.ok, text: syncText(r.data) });
    router.refresh();
  }

  async function removeUrl() {
    if (!window.confirm("¿Desconectar el calendario de Moodle? Las fechas ya importadas quedan.")) return;
    setBusy(true);
    const r = await send("/api/study/moodle", "PUT", { url: null });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg(null);
    router.refresh();
  }

  async function importFile(f: File) {
    if (f.size > 1_000_000) return setMsg({ ok: false, text: "El archivo pesa más de 1 MB." });
    setBusy(true);
    setMsg(null);
    const r = await send<{ events: number; created: number; updated: number }>("/api/study/ics", "POST", { text: await f.text() });
    setBusy(false);
    if (file.current) file.current.value = "";
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: `Importado: ${r.data.created} fechas nuevas y ${r.data.updated} actualizadas (de ${r.data.events}).` });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Calendario de Moodle</CardTitle>
          <CardDescription>Trae solas las fechas del aula virtual, todos los días. No hace falta tu contraseña.</CardDescription>
        </div>
      </CardHeader>

      {masked ? (
        <div className="space-y-3 text-xs">
          <p className="text-ink-2">
            Conectado a <span className="font-medium text-ink">{masked}</span>
          </p>
          {sync && <p className={sync.ok ? "text-ink-3" : "text-bad"}>{syncText(sync)}</p>}
          {canSave && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={syncNow}>
                <RefreshCw className={busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Sincronizar ahora
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={removeUrl}>
                Desconectar
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <ol className="mb-3 list-decimal space-y-1 pl-4 text-xs text-ink-2">
            <li>Entrá a Moodle y abrí <strong className="font-medium">Calendario</strong> (en el menú o en moodle/calendar/view.php).</li>
            <li>
              Abajo tocá <strong className="font-medium">Exportar calendario</strong> (o “Importar o exportar calendarios” → Exportar).
            </li>
            <li>Elegí “Todos los eventos” y “Eventos recientes y próximos”, y tocá <strong className="font-medium">Obtener URL del calendario</strong>.</li>
            <li>Copiá ese link y pegalo acá. Es privado: no lo compartas.</li>
          </ol>
          {canSave && (
            <form onSubmit={saveUrl} className="flex gap-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/calendar/export_execute.php?…" inputMode="url" />
              <Button type="submit" disabled={busy || !url.trim()}>
                Conectar
              </Button>
            </form>
          )}
        </>
      )}

      {canSave && (
        <div className="mt-4 border-t border-border pt-4">
          <Field label="O subí un archivo .ics" hint="Por ejemplo, un calendario que te pasaron. Si cargaste tus ATI con el botón, las fechas oficiales ya están.">
            <input ref={file} type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => file.current?.click()}>
              <FileUp className="h-3.5 w-3.5" /> Elegir archivo
            </Button>
          </Field>
        </div>
      )}
      {msg && <p className={`mt-3 text-xs ${msg.ok ? "text-ink-2" : "text-bad"}`}>{msg.text}</p>}
    </Card>
  );
}
