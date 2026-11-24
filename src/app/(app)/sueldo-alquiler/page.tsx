import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { SalaryEstimator } from "@/components/forms/salary-estimator";
import { RentCalculator } from "@/components/forms/rent-calculator";
import { DocumentUpload } from "@/components/forms/document-upload";
import { DemoNotice } from "@/components/dashboard/demo-notice";
import { loadFinanceContext, seniorityYears } from "@/lib/data/context";
import { formatARS, monthOf, todayAR } from "@/lib/finance";
import { monthLabel } from "@/lib/labels";

export const metadata: Metadata = { title: "Sueldo y alquiler" };
export const dynamic = "force-dynamic";

export default async function SueldoAlquilerPage() {
  const ctx = await loadFinanceContext(todayAR());
  const initialRent = ctx.rent ?? {
    startDate: `${monthOf(ctx.today)}-01`,
    baseRentCents: 0,
    adjustmentIntervalMonths: 3,
    indexType: "ICL" as const,
    durationMonths: 36,
    lagMonths: 1,
    dueDay: 10,
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Sueldo y alquiler" description="Estimá tu sueldo por convenio, compará con el recibo y calculá el próximo aumento del alquiler." />
      {ctx.demo && <DemoNotice />}
      <SalaryEstimator
        scales={ctx.scales}
        today={ctx.today}
        lastPayslip={ctx.payslips[0]}
        initial={
          ctx.profile
            ? { category: ctx.profile.category, seniorityYears: seniorityYears(ctx.profile.hireDate, ctx.today), weeklyHours: ctx.profile.weeklyHours }
            : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DocumentUpload kind="payslip" canSave={!ctx.demo} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Recibos cargados</CardTitle>
          </CardHeader>
          {ctx.payslips.length === 0 ? (
            <p className="text-sm text-ink-3">Todavía no hay recibos.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {ctx.payslips.map((p) => (
                <li key={p.period} className="flex items-center gap-3 py-2">
                  <span className="flex-1">{monthLabel(p.period)}</span>
                  {p.documentId && (
                    <a href={`/api/documents/${p.documentId}`} target="_blank" rel="noopener" className="text-xs text-accent hover:underline">
                      Original
                    </a>
                  )}
                  <span className="num font-medium">{formatARS(p.netCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <RentCalculator
        initial={initialRent}
        indices={ctx.indices}
        today={ctx.today}
        defaultInflation={ctx.settings.monthlyInflation}
        canSave={!ctx.demo}
        saved={Boolean(ctx.rent)}
      />
    </div>
  );
}
