import Link from "next/link";
import { Settings } from "lucide-react";
import { BottomNav, Sidebar } from "@/components/layout/app-nav";
import { DollarWidget } from "@/components/dashboard/dollar-widget";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6 lg:px-10">
            <span className="text-[15px] font-semibold tracking-tight lg:hidden">Mis Finanzas</span>
            <div className="ml-auto flex min-w-0 items-center gap-3">
              <DollarWidget />
              <Link href="/configuracion" aria-label="Configuración" className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-muted hover:text-ink lg:hidden">
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12">{children}</main>
        </div>
      </div>
      <BottomNav />
    </>
  );
}
