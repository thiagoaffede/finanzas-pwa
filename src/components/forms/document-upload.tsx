"use client";

import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Carga de boleta o recibo (PDF/foto/cámara). La extracción con LLM llega en la Fase 3. */
export function DocumentUpload({ kind }: { kind: "bill" | "payslip" }) {
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const title = kind === "bill" ? "Cargar boleta" : "Importar recibo de sueldo";

  async function onFile(file: File) {
    setStatus("sending");
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    try {
      const res = await fetch("/api/documents/parse", { method: "POST", body: form });
      const data = await res.json();
      setMessage(data.message ?? data.error ?? "Listo");
    } catch {
      setMessage("No se pudo enviar el archivo. Probá de nuevo con conexión.");
    }
    setStatus("done");
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>PDF o foto. Vas a ver una pantalla de confirmación antes de guardar.</CardDescription>
        </div>
      </CardHeader>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-muted/50 px-4 py-8 text-center text-sm text-ink-2 hover:bg-surface-muted">
        {status === "sending" ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5 text-ink-3" />}
        <span>Tocá para elegir un archivo o sacar una foto</span>
        <input
          type="file"
          accept="application/pdf,image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>
      {message && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-accent-soft p-3 text-xs text-accent">
          <span>{message}</span>
          <Button variant="ghost" size="sm" onClick={() => { setMessage(null); setStatus("idle"); }}>
            Cerrar
          </Button>
        </div>
      )}
    </Card>
  );
}
