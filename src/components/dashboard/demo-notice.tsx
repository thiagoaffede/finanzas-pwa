import { Info } from "lucide-react";

export function DemoNotice() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-xs text-ink-2">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
      <p>
        Estás viendo <strong className="font-medium text-ink">datos de ejemplo</strong>. Al configurar <code>DATABASE_URL</code> se
        usan tus movimientos reales. Escalas e índices son valores de referencia hasta que cargues los vigentes.
      </p>
    </div>
  );
}
