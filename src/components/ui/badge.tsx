import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", {
  variants: {
    tone: {
      neutral: "bg-surface-muted text-ink-2",
      accent: "bg-accent-soft text-accent",
      good: "bg-good-soft text-good",
      warn: "bg-warn-soft text-warn",
      bad: "bg-bad-soft text-bad",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
