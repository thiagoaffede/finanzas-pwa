"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { send } from "@/lib/client-api";

/** Carga los cursos armados (por ejemplo, los dos ATI de la UNS) con un botón. */
export function TemplateLoader({ templates, canSave }: { templates: { id: string; title: string; description: string }[]; canSave: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(id: string) {
    setBusy(id);
    setError(null);
    const r = await send("/api/study/templates", "POST", { id });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Cargar tus cursos</CardTitle>
          <CardDescription>Con los temas, las fechas objetivo de tu plan y el calendario ATI. Después podés cambiar todo.</CardDescription>
        </div>
      </CardHeader>
      <ul className="space-y-3">
        {templates.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              <p className="text-xs text-ink-3">{t.description}</p>
            </div>
            <Button size="sm" disabled={!canSave || busy !== null} onClick={() => load(t.id)}>
              <Download className="h-3.5 w-3.5" /> {busy === t.id ? "Cargando…" : "Cargar"}
            </Button>
          </li>
        ))}
      </ul>
      {!canSave && <p className="mt-3 text-xs text-ink-3">Conectá la base de datos para guardar.</p>}
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
    </Card>
  );
}
