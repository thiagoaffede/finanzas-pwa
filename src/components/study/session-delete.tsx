"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { send } from "@/lib/client-api";

export function SessionDelete({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Borrar registro"
      className="rounded p-1 text-ink-3 hover:bg-surface-muted"
      onClick={async () => {
        if (!window.confirm("¿Borrar este registro de tiempo?")) return;
        const r = await send(`/api/study/sessions/${id}`, "DELETE");
        if (r.ok) router.refresh();
      }}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
