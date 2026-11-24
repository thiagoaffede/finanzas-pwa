"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { classifyDue, DUE_BUCKET_LABEL } from "@/lib/finance/deadlines";
import { formatARS } from "@/lib/finance/money";
import { dateLabel, monthLabel, PROVIDER_NAME } from "@/lib/labels";
import { send } from "@/lib/client-api";
import type { BillView } from "@/lib/data/context";

const TONE = { paid: "good", overdue: "bad", today: "bad", next3: "warn", week: "accent", later: "neutral" } as const;

export function BillsList({ bills, today, anomalies, canSave }: { bills: BillView[]; today: string; anomalies: Record<string, string>; canSave: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(b: BillView) {
    setBusy(b.id);
    const r = await send(`/api/bills/${b.id}`, "PATCH", { paid: !b.paid });
    setBusy(null);
    if (r.ok) router.refresh();
    else setError(r.error);
  }

  if (bills.length === 0) return <p className="text-sm text-ink-3">No hay boletas cargadas. Subí una con el botón de al lado.</p>;

  return (
    <>
      <ul className="divide-y divide-border">
        {bills.map((b) => {
          const bucket = classifyDue(b.dueDate, today, b.paid);
          return (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
              <div className="min-w-0 flex-1 basis-40">
                <p className="font-medium">{PROVIDER_NAME[b.provider] ?? b.provider}</p>
                <p className="text-[11px] text-ink-3">
                  {monthLabel(b.period)} · vence {dateLabel(b.dueDate)}
                </p>
                {anomalies[b.id] && <p className="mt-1 text-[11px] text-warn">{anomalies[b.id]}</p>}
              </div>
              <Badge tone={TONE[bucket]}>{DUE_BUCKET_LABEL[bucket]}</Badge>
              <span className="num w-24 text-right font-medium">{formatARS(b.amountCents)}</span>
              {canSave && (
                <Button variant={b.paid ? "ghost" : "outline"} size="sm" disabled={busy === b.id} onClick={() => toggle(b)}>
                  {b.paid ? "Desmarcar" : (<><Check className="h-3.5 w-3.5" /> Pagada</>)}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    </>
  );
}
