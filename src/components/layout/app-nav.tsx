"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav-items";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface px-4 py-6 lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
          <Wallet className="h-4 w-4" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Mis Finanzas</span>
      </Link>
      <nav className="flex flex-col gap-1">
        {[...NAV_ITEMS, SETTINGS_ITEM].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-2 transition-colors hover:bg-surface-muted hover:text-ink",
              isActive(pathname, href) && "bg-surface-muted font-medium text-ink",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <button
        type="button"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.replace("/login");
          router.refresh();
        }}
        className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-3 hover:bg-surface-muted hover:text-ink"
      >
        <LogOut className="h-4 w-4" /> Salir
      </button>
    </aside>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV_ITEMS.map(({ href, short, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link href={href} className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] text-ink-3", active && "text-ink")}>
                <Icon className={cn("h-5 w-5", active && "text-accent")} />
                {short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
