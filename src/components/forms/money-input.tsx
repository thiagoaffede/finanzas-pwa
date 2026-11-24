"use client";

import { Input } from "@/components/ui/input";
import { parseAmountToCents } from "@/lib/finance/money";
import { useState } from "react";

/** Input de pesos que acepta "1.234,56" y devuelve centavos. */
export function MoneyInput({ valueCents, onChange, placeholder, id }: { valueCents: number; onChange: (c: number) => void; placeholder?: string; id?: string }) {
  const [text, setText] = useState(valueCents ? (valueCents / 100).toLocaleString("es-AR") : "");
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">$</span>
      <Input
        id={id}
        inputMode="decimal"
        className="num pl-7"
        value={text}
        placeholder={placeholder ?? "0"}
        onChange={(e) => {
          setText(e.target.value);
          const c = parseAmountToCents(e.target.value);
          onChange(c ?? 0);
        }}
      />
    </div>
  );
}

/** Input de porcentaje: muestra "3" y devuelve 0.03. */
export function PctInput({ value, onChange, step = 0.1 }: { value: number; onChange: (r: number) => void; step?: number }) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        className="num pr-8"
        value={Number.isFinite(value) ? Math.round(value * 10000) / 100 : ""}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">%</span>
    </div>
  );
}
