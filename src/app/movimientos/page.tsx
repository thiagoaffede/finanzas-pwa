import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { MovementsView } from "@/components/forms/movements-view";
import { DocumentUpload } from "@/components/forms/document-upload";
import { PROVIDER_NAME, monthLabel, dateLabel } from "@/lib/labels";
import { DemoNotice } from "@/components/dashboard/demo-notice";
import { classifyDue, DUE_BUCKET_LABEL, detectBillAnomaly, formatARS, todayAR } from "@/lib/finance";
import { DEMO_SETTINGS, demoBills, demoGasHistory, demoTransactions } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Movimientos y servicios" };
export const dynamic = "force-dynamic";


export default function MovimientosPage() {
  const today = todayAR();
  const bills = demoBills(today);
  const gasHistory = demoGasHistory(today);

  return (
    <div className="space-y-6">
      <PageHeader title="Movimientos y servicios" description="Gastos, cuotas, boletas de servicios y plata a recuperar.">
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/export?format=csv&what=transactions">
              <Download className="h-3.5 w-3.5" /> CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/api/export?format=json&what=all">
              <Download className="h-3.5 w-3.5" /> Backup JSON
            </a>
          </Button>
        </div>
      </PageHeader>
      <DemoNotice />
      <MovementsView transactions={demoTransactions(today)} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Servicios</CardTitle>
              <CardDescription>Boletas del período con su vencimiento.</CardDescription>
            </div>
          </CardHeader>
          <ul className="divide-y divide-border">
            {bills.map((b) => {
              const bucket = classifyDue(b.dueDate, today, b.paid);
              const anomaly =
                b.provider === "CAMUZZI"
                  ? detectBillAnomaly(gasHistory, { period: b.period, amountCents: b.amountCents }, { monthlyInflation: DEMO_SETTINGS.monthlyInflation })
                  : null;
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{PROVIDER_NAME[b.provider]}</p>
                    <p className="text-[11px] text-ink-3">
                      Período {monthLabel(b.period)} · vence {dateLabel(b.dueDate)}
                    </p>
                    {anomaly?.isAnomaly && <p className="mt-1 text-[11px] text-warn">{anomaly.reason}</p>}
                  </div>
                  <Badge tone={bucket === "paid" ? "good" : bucket === "overdue" || bucket === "today" ? "bad" : bucket === "next3" ? "warn" : "neutral"}>
                    {DUE_BUCKET_LABEL[bucket]}
                  </Badge>
                  <span className="num w-28 text-right font-medium">{formatARS(b.amountCents)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        <DocumentUpload kind="bill" />
      </div>
    </div>
  );
}
