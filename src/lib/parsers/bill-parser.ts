import type { BillProvider } from "@/types/finance";
import { billExtraction, type BillInput } from "@/lib/schemas";
import { parseAmountToCents } from "@/lib/finance/money";
import { monthOf } from "@/lib/finance/dates";
import { normalizeDate, normalizePeriod } from "./normalize";

/** Normaliza la extracción cruda de una boleta (LLM/OCR) a un `BillInput` validado. */

const PROVIDER_PATTERNS: [BillProvider, RegExp][] = [
  ["EDES", /\bedes\b|energ[ií]a del sur/i],
  ["CAMUZZI", /camuzzi/i],
  ["BVC", /\bbvc\b|cooperativa.*bah[ií]a|villa.*cooperativa/i],
  ["PERSONAL", /\bpersonal\b|telecom/i],
];

export function detectProvider(emisor: string): BillProvider {
  for (const [p, re] of PROVIDER_PATTERNS) if (re.test(emisor)) return p;
  return "OTRO";
}

export type ParseResult<T> = { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };

export function parseBillExtraction(raw: unknown): ParseResult<BillInput> {
  const parsed = billExtraction.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const x = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  const amountCents = parseAmountToCents(x.monto);
  if (amountCents === null || amountCents <= 0) errors.push(`Monto ilegible: "${x.monto}"`);
  const dueDate = normalizeDate(x.vencimiento);
  if (!dueDate) errors.push(`Vencimiento ilegible: "${x.vencimiento}"`);
  let billingPeriod = normalizePeriod(x.periodo);
  if (!billingPeriod && dueDate) {
    billingPeriod = monthOf(dueDate);
    warnings.push("Período no encontrado: se usó el mes del vencimiento");
  }
  if (x.moneda && x.moneda.toUpperCase() !== "ARS") warnings.push(`Moneda ${x.moneda}: revisar`);
  if (x.confianza !== undefined && x.confianza < 0.7) warnings.push("Baja confianza en la extracción: revisá los datos");
  const provider = detectProvider(x.emisor);
  if (provider === "OTRO") warnings.push(`Proveedor no reconocido: "${x.emisor}"`);

  if (errors.length || !dueDate || !billingPeriod || amountCents === null) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    value: {
      provider,
      providerLabel: x.emisor,
      accountNumber: x.numero_cliente ?? null,
      billingPeriod,
      issueDate: normalizeDate(x.fecha_emision),
      dueDate,
      secondDueDate: normalizeDate(x.segundo_vencimiento),
      amountCents,
      status: "pending",
    recurring: false,
    recurrenceMonths: 1,
    },
  };
}
