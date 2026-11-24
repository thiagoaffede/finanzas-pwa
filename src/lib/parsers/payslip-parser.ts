import { payslipExtraction } from "@/lib/schemas";
import { parseAmountToCents } from "@/lib/finance/money";
import type { PayLine, PayslipTotals } from "@/lib/finance/commerce-union";
import { normalizeDate, normalizePeriod } from "./normalize";
import type { ParseResult } from "./bill-parser";

/** Normaliza haberes, descuentos y neto de un recibo de sueldo extraído. */

export interface ParsedPayslip extends PayslipTotals {
  employer: string | null;
  paymentDate: string | null;
  lines: PayLine[];
}

export function parsePayslipExtraction(raw: unknown): ParseResult<ParsedPayslip> {
  const parsed = payslipExtraction.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const x = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  const lines: PayLine[] = [];
  for (const h of x.haberes) {
    const amount = parseAmountToCents(h.monto);
    if (amount === null) errors.push(`Haber ilegible: ${h.concepto} "${h.monto}"`);
    else lines.push({ code: "", label: h.concepto, type: h.remunerativo ? "rem" : "nonrem", amountCents: amount });
  }
  for (const d of x.descuentos) {
    const amount = parseAmountToCents(d.monto);
    if (amount === null) errors.push(`Descuento ilegible: ${d.concepto} "${d.monto}"`);
    else lines.push({ code: "", label: d.concepto, type: "deduction", amountCents: Math.abs(amount) });
  }

  const sum = (t: PayLine["type"]) => lines.filter((l) => l.type === t).reduce((s, l) => s + l.amountCents, 0);
  const remunerativeCents = sum("rem");
  const nonRemunerativeCents = sum("nonrem");
  const deductionsCents = sum("deduction");
  const netCents = parseAmountToCents(x.neto);
  if (netCents === null) errors.push(`Neto ilegible: "${x.neto}"`);

  const period = normalizePeriod(x.periodo);
  if (!period) errors.push(`Período ilegible: "${x.periodo}"`);

  // Controles cruzados: los totales impresos deben coincidir con la suma de líneas.
  const check = (label: string, printed: string | null | undefined, computed: number) => {
    if (!printed) return;
    const p = parseAmountToCents(printed);
    if (p !== null && Math.abs(p - computed) > 100) warnings.push(`${label}: impreso ${p / 100} vs suma de líneas ${computed / 100}`);
  };
  check("Total remunerativo", x.total_remunerativo, remunerativeCents);
  check("Total no remunerativo", x.total_no_remunerativo, nonRemunerativeCents);
  check("Total descuentos", x.total_descuentos, deductionsCents);
  if (netCents !== null) {
    const computedNet = remunerativeCents + nonRemunerativeCents - deductionsCents;
    if (Math.abs(computedNet - netCents) > 100) warnings.push(`Neto impreso ${netCents / 100} ≠ haberes − descuentos ${computedNet / 100}`);
  }

  if (errors.length || !period || netCents === null) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    value: {
      period,
      employer: x.empleador ?? null,
      paymentDate: normalizeDate(x.fecha_pago),
      remunerativeCents,
      nonRemunerativeCents,
      deductionsCents,
      netCents,
      lines,
    },
  };
}
