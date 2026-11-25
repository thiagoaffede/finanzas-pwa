import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { DemoNotice } from "@/components/dashboard/demo-notice";
import { BackupManager, ExportCard } from "@/components/forms/backup-manager";
import { loadFinanceContext } from "@/lib/data/context";
import { todayAR } from "@/lib/finance";

export const metadata: Metadata = { title: "Backup y exportar" };
export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const ctx = await loadFinanceContext(todayAR());
  return (
    <div className="space-y-6">
      <PageHeader title="Backup y exportar" description="Bajá una copia de tus datos, restaurala si hace falta, o llevalos a Excel." />
      {ctx.demo && <DemoNotice />}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <BackupManager canSave={!ctx.demo} lastBackupAt={ctx.settings.lastBackupAt} />
        </div>
        <div className="min-w-0 space-y-4">
          <ExportCard />
        </div>
      </div>
    </div>
  );
}
