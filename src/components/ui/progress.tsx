import { cn } from "@/lib/utils";

const TONE = { accent: "bg-accent", good: "bg-good", warn: "bg-warn", bad: "bg-bad" } as const;

export function Progress({ value, className, tone = "accent" }: { value: number; className?: string; tone?: keyof typeof TONE }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-muted", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", TONE[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
