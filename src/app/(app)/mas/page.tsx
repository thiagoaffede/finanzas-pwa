import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LogoutButton } from "@/components/forms/settings-forms";
import { NAV_ITEMS, SETTINGS_ITEM } from "@/components/layout/nav-items";

export const metadata: Metadata = { title: "Más" };

/** En el celu: las secciones que no entran en la barra de abajo. */
export default function MasPage() {
  const items = [...NAV_ITEMS.filter((i) => !i.bottom), SETTINGS_ITEM];
  return (
    <div className="space-y-6">
      <PageHeader title="Más" />
      <Card className="p-0">
        <ul className="divide-y divide-border">
          {items.map(({ href, label, hint, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-3 px-5 py-4 text-sm hover:bg-surface-muted">
                <Icon className="h-5 w-5 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{label}</span>
                  {hint && <span className="block text-xs text-ink-3">{hint}</span>}
                </span>
                <ChevronRight className="h-4 w-4 text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <LogoutButton />
    </div>
  );
}
