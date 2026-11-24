import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SalaryEstimator } from "@/components/forms/salary-estimator";
import { RentCalculator } from "@/components/forms/rent-calculator";
import { DocumentUpload } from "@/components/forms/document-upload";
import { DemoNotice } from "@/components/dashboard/demo-notice";
import { addMonths, monthOf, todayAR } from "@/lib/finance";
import { DEMO_SETTINGS, demoIndices, demoRentContract, demoScales } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Sueldo y alquiler" };
export const dynamic = "force-dynamic";

export default function SueldoAlquilerPage() {
  const today = todayAR();
  const lastPayslip = {
    period: addMonths(monthOf(today), -1),
    remunerativeCents: 118_720_000,
    nonRemunerativeCents: 4_520_000,
    deductionsCents: 22_480_000,
    netCents: 100_760_000,
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Sueldo y alquiler" description="Estimá tu sueldo por convenio, compará con el recibo y calculá el próximo aumento del alquiler." />
      <DemoNotice />
      <SalaryEstimator scales={demoScales(today)} today={today} lastPayslip={lastPayslip} />
      <DocumentUpload kind="payslip" />
      <RentCalculator initial={demoRentContract(today)} indices={demoIndices(today)} today={today} defaultInflation={DEMO_SETTINGS.monthlyInflation} />
    </div>
  );
}
