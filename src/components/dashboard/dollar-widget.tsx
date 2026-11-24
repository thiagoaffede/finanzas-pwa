"use client";

import { useEffect, useState } from "react";
import { formatARS } from "@/lib/finance/money";
import type { DollarSnapshot } from "@/lib/market/dollar-client";
import { cn } from "@/lib/utils";

/** Cotizaciones del dólar (header). Lee /api/market, que cachea en el server. */
export function DollarWidget({ compact = false, houses = ["oficial", "bolsa", "blue"] }: { compact?: boolean; houses?: string[] }) {
  const [data, setData] = useState<DollarSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/market")
        .then((r) => r.json())
        .then((d: DollarSnapshot) => alive && setData(d))
        .catch(() => alive && setData({ quotes: [], fetchedAt: new Date().toISOString(), stale: true, error: "sin conexión" }));
    load();
    const id = setInterval(load, 10 * 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const quotes = data?.quotes.filter((q) => houses.includes(q.house)) ?? [];

  if (!data) return <div className={cn("h-8 w-48 animate-pulse rounded-lg bg-surface-muted", compact && "w-32")} />;
  if (quotes.length === 0)
    return <span className="text-xs text-ink-3" title={data.error}>Dólar: sin datos por ahora</span>;

  return (
    <div className="flex items-center gap-4 overflow-x-auto text-xs">
      {quotes.map((q) => (
        <div key={q.house} className="whitespace-nowrap">
          <span className="text-ink-3">{q.name} </span>
          <span className="num font-semibold text-ink">{q.sellCents ? formatARS(q.sellCents) : "—"}</span>
        </div>
      ))}
      {data.stale && <span className="text-warn">desactualizado</span>}
    </div>
  );
}
