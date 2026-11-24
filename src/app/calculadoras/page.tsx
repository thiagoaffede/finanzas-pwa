import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { InstallmentsCalculator } from "@/components/forms/installments-calculator";
import { DEMO_SETTINGS } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Calculadoras" };

export default function CalculadorasPage() {
  return (
    <>
      <PageHeader title="Contado vs. cuotas" description="Compará opciones en términos reales, con tu inflación estimada." />
      <InstallmentsCalculator defaultInflation={DEMO_SETTINGS.monthlyInflation} defaultAltRate={DEMO_SETTINGS.monthlyAlternativeRate} />
    </>
  );
}
