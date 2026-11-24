import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BottomNav, Sidebar } from "@/components/layout/app-nav";
import { DollarWidget } from "@/components/dashboard/dollar-widget";
import { ServiceWorkerRegister } from "@/components/layout/sw-register";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Mis Finanzas", template: "%s · Mis Finanzas" },
  description: "Finanzas personales: cuánto puedo gastar, vencimientos, sueldo, alquiler y objetivos.",
  applicationName: "Mis Finanzas",
  appleWebApp: { capable: true, title: "Mis Finanzas", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#f7f7f5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={inter.variable}>
      <body className="font-sans antialiased">
        <div className="flex min-h-dvh">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6 lg:px-10">
              <span className="text-[15px] font-semibold tracking-tight lg:hidden">Mis Finanzas</span>
              <div className="ml-auto min-w-0">
                <DollarWidget />
              </div>
            </header>
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12">{children}</main>
          </div>
        </div>
        <BottomNav />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
