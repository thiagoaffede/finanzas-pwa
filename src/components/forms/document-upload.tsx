"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, PencilLine } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmBill, ConfirmPayslip, type BillDraft, type PayslipDraft } from "./confirm-document";

type State =
  | { step: "idle" }
  | { step: "reading" }
  | { step: "confirm"; draft: Partial<BillDraft> | Partial<PayslipDraft>; raw?: unknown; warnings: string[]; documentId?: string | null }
  | { step: "saved" };

/** Carga de boleta o recibo: foto/PDF → lectura automática → confirmación → guardado. */
export function DocumentUpload({ kind, canSave = true }: { kind: "bill" | "payslip"; canSave?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "idle" });
  const [message, setMessage] = useState<string | null>(null);
  const title = kind === "bill" ? "Cargar boleta" : "Importar recibo de sueldo";

  async function onFile(original: File) {
    setMessage(null);
    setState({ step: "reading" });
    const file = await shrinkImage(original);
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    try {
      const res = await fetch("/api/documents/parse", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(res.status === 401 ? "Tu sesión venció. Volvé a entrar." : (data.error ?? "No se pudo leer el archivo."));
        setState({ step: "idle" });
        return;
      }
      // Siempre se pasa a revisar: con datos si se pudo leer, vacío si hay que completarlo a mano.
      const warnings = [...(data.message ? [data.message] : []), ...(data.warnings ?? [])];
      setState({ step: "confirm", draft: data.ok ? data.draft : {}, raw: data.raw ?? undefined, warnings, documentId: data.documentId ?? null });
    } catch {
      setMessage("No se pudo enviar el archivo. Probá de nuevo con conexión.");
      setState({ step: "idle" });
    }
  }

  const done = () => {
    setState({ step: "saved" });
    setMessage(kind === "bill" ? "Boleta guardada." : "Recibo guardado.");
    router.refresh();
  };
  const cancel = () => {
    // El original subido sin confirmar se descarta.
    if (state.step === "confirm" && state.documentId) fetch(`/api/documents/${state.documentId}`, { method: "DELETE" }).catch(() => {});
    setState({ step: "idle" });
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>PDF o foto. Se guarda el original y revisás los datos antes de confirmar.</CardDescription>
        </div>
        {state.step !== "confirm" && canSave && (
          <Button variant="ghost" size="sm" onClick={() => setState({ step: "confirm", draft: {}, warnings: [] })}>
            <PencilLine className="h-3.5 w-3.5" /> A mano
          </Button>
        )}
      </CardHeader>

      {state.step === "confirm" ? (
        <div className="space-y-3">
          {state.warnings.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-warn-soft p-3 text-xs text-warn">
              {state.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {kind === "bill" ? (
            <ConfirmBill draft={state.draft as Partial<BillDraft>} raw={state.raw} documentId={state.documentId} onDone={done} onCancel={cancel} />
          ) : (
            <ConfirmPayslip draft={state.draft as Partial<PayslipDraft>} raw={state.raw} documentId={state.documentId} onDone={done} onCancel={cancel} />
          )}
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-muted/50 px-4 py-8 text-center text-sm text-ink-2 hover:bg-surface-muted">
          {state.step === "reading" ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5 text-ink-3" />}
          <span>{state.step === "reading" ? "Leyendo el documento…" : "Tocá para elegir un archivo o sacar una foto"}</span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={state.step === "reading"}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onFile(f);
            }}
          />
        </label>
      )}
      {message && <p className="mt-3 rounded-xl bg-accent-soft p-3 text-xs text-accent">{message}</p>}
    </Card>
  );
}

/** Achica fotos grandes (máx. 2000 px, JPEG) para no pasar el límite de 4 MB y ahorrar espacio. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1_500_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
