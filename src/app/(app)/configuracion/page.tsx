import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoNotice } from "@/components/dashboard/demo-notice";
import { IndicesManager, LogoutButton, PayrollProfileForm, ScalesManager, SettingsForm } from "@/components/forms/settings-forms";
import { loadFinanceContext } from "@/lib/data/context";
import { PushToggle } from "@/components/forms/push-toggle";
import { authEnabled } from "@/lib/auth";
import { todayAR } from "@/lib/finance";

export const metadata: Metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const ctx = await loadFinanceContext(todayAR());
  const canSave = !ctx.demo;

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" description="Supuestos de inflación, saldo, tu puesto, escalas del convenio e índices del alquiler." />
      {ctx.demo && <DemoNotice />}

      <PushToggle canSave={canSave} />
      <SettingsForm initial={ctx.settings} canSave={canSave} usesAccounts={ctx.accounts.some((a) => a.kind !== "tarjeta")} />
      <PayrollProfileForm initial={ctx.profile} canSave={canSave} />
      <ScalesManager scales={ctx.scales} canSave={canSave} defaultCategory={ctx.profile?.category} />
      <IndicesManager indices={ctx.indices} canSave={canSave} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Contrato de alquiler</CardTitle>
            <CardDescription>
              Se carga desde <Link href="/sueldo-alquiler" className="text-accent underline-offset-2 hover:underline">Sueldo y alquiler</Link>: completá el contrato y tocá Guardar.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      {authEnabled() && (
        <div className="lg:hidden">
          <LogoutButton />
        </div>
      )}
    </div>
  );
}
