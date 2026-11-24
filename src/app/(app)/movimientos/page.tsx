import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MovementsView } from "@/components/forms/movements-view";
import { BillsList } from "@/components/forms/bills-list";
import { DocumentUpload } from "@/components/forms/document-upload";
import { DemoNotice } from "@/components/dashboard/demo-notice";
import { loadFinanceContext } from "@/lib/data/context";
import { billAnomalies } from "@/lib/dashboard";
import { todayAR } from "@/lib/finance";

export const metadata: Metadata = { title: "Movimientos y servicios" };
export const dynamic = "force-dynamic";

export default async function MovimientosPage() {
  const ctx = await loadFinanceContext(todayAR());
  const anomalies = Object.fromEntries(billAnomalies(ctx).filter((a) => a.isAnomaly).map((a) => [a.billId, a.reason]));

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
      {ctx.demo && <DemoNotice />}
      <MovementsView transactions={ctx.transactions} canSave={!ctx.demo} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Servicios</CardTitle>
              <CardDescription>Boletas impagas y las de este mes.</CardDescription>
            </div>
          </CardHeader>
          <BillsList bills={ctx.bills} today={ctx.today} anomalies={anomalies} canSave={!ctx.demo} />
        </Card>
        <DocumentUpload kind="bill" canSave={!ctx.demo} />
      </div>
    </div>
  );
}
