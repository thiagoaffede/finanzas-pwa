import { cn } from "@/lib/utils";

export function Stat({ label, value, hint, tone, className }: { label: string; value: string; hint?: string; tone?: "good" | "warn" | "bad"; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-ink-3">{label}</p>
      <p className={cn("num mt-0.5 truncate text-lg font-semibold", tone === "good" && "text-good", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>{value}</p>
      {hint && <p className="text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}
