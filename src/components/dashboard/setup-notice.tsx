import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { FinanceContext } from "@/lib/data/context";

/** Lista corta de lo que falta configurar para que los números sean reales. */
export function SetupNotice({ ctx }: { ctx: FinanceContext }) {
  const missing: { label: string; href: string }[] = [];
  if (ctx.netIncomeSource === "sin datos") missing.push({ label: "tu sueldo (recibo, escala o monto a mano)", href: "/configuracion" });
  if (!ctx.rent) missing.push({ label: "el contrato de alquiler", href: "/sueldo-alquiler" });
  if (ctx.rent && ctx.rent.indexType !== "FIXED" && !(ctx.rent.indexType === "ICL" ? ctx.indices.icl?.length : ctx.indices.ipc?.length))
    missing.push({ label: `los valores del ${ctx.rent.indexType}`, href: "/configuracion#indices" });
  if (missing.length === 0) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-xs text-ink-2">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
      <div>
        <p>Para que los números sean exactos falta cargar:</p>
        <ul className="mt-1 space-y-0.5">
          {missing.map((m) => (
            <li key={m.label}>
              <Link href={m.href} className="inline-flex items-center gap-1 font-medium text-ink hover:text-accent">
                {m.label} <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
