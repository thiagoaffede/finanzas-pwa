import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { InstallmentsCalculator } from "@/components/forms/installments-calculator";
import { loadFinanceContext } from "@/lib/data/context";
import { todayAR } from "@/lib/finance";

export const metadata: Metadata = { title: "Calculadoras" };
export const dynamic = "force-dynamic";

export default async function CalculadorasPage() {
  const { settings } = await loadFinanceContext(todayAR());
  return (
    <>
      <PageHeader title="Contado vs. cuotas" description="Compará opciones en términos reales, con tu inflación estimada." />
      <InstallmentsCalculator defaultInflation={settings.monthlyInflation} defaultAltRate={settings.monthlyAlternativeRate} />
    </>
  );
}
