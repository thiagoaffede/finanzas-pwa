import type { Cents, Rate } from "@/types/finance";
import { annualFromMonthly, mulCents, splitCents } from "./money";

/**
 * Contado vs. cuotas con inflación.
 *
 * Se trae a valor presente cada cuota descontándola a la tasa mensual de referencia
 * (inflación esperada o rendimiento alternativo, la que sea mayor si se pasan ambas,
 * porque es el costo de oportunidad real de pagar hoy).
 *
 *   VP = Σ cuota_k / (1 + r)^(k + offset)     k = 0 … n−1
 *
 * Si VP(cuotas) < precio de contado, conviene cuotas.
 */

export interface InstallmentOption {
  count: number;
  /** Monto de cada cuota. Si no se da, se calcula con `surchargeRate` sobre el precio de lista. */
  installmentCents?: Cents;
  /** Recargo total sobre el precio de lista (0.2 = 20 %). */
  surchargeRate?: Rate;
  /** Meses hasta la primera cuota (tarjeta: normalmente 1). */
  firstPaymentOffsetMonths?: number;
}

export interface CashVsInstallmentsInput {
  /** Precio de lista (base para el recargo). */
  listPriceCents: Cents;
  /** Descuento por pago contado (0.1 = 10 %). */
  cashDiscountRate?: Rate;
  option: InstallmentOption;
  /** Inflación mensual esperada. */
  monthlyInflation: Rate;
  /** Rendimiento mensual alternativo (plazo fijo, FCI, etc.). */
  monthlyAlternativeRate?: Rate;
}

export interface CashVsInstallmentsResult {
  cashPriceCents: Cents;
  installments: Cents[];
  nominalTotalCents: Cents;
  presentValueCents: Cents;
  discountRate: Rate;
  /** Positivo = te ahorrás eso (en pesos de hoy) eligiendo cuotas. */
  savingWithInstallmentsCents: Cents;
  savingPct: Rate;
  best: "cuotas" | "contado" | "igual";
  /** Tasa mensual implícita que te cobran financiando vs. contado (TIR). */
  impliedMonthlyRate: Rate | null;
  impliedAnnualRate: Rate | null;
  summary: string;
}

export function presentValue(payments: Cents[], monthlyRate: Rate, offsetMonths = 1): number {
  return payments.reduce((acc, p, k) => acc + p / Math.pow(1 + monthlyRate, k + offsetMonths), 0);
}

/** Tasa mensual que iguala el VP de los pagos al precio contado (bisección). */
export function impliedRate(cashCents: Cents, payments: Cents[], offsetMonths = 1): Rate | null {
  const f = (r: number) => presentValue(payments, r, offsetMonths) - cashCents;
  let lo = -0.99;
  let hi = 10;
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

export function compareCashVsInstallments(input: CashVsInstallmentsInput): CashVsInstallmentsResult {
  const { option } = input;
  if (!Number.isInteger(option.count) || option.count < 1) throw new Error("Cantidad de cuotas inválida");
  const offset = option.firstPaymentOffsetMonths ?? 1;
  const cashPriceCents = mulCents(input.listPriceCents, 1 - (input.cashDiscountRate ?? 0));

  const installments =
    option.installmentCents !== undefined
      ? Array.from({ length: option.count }, () => option.installmentCents!)
      : splitCents(mulCents(input.listPriceCents, 1 + (option.surchargeRate ?? 0)), option.count);

  const discountRate = Math.max(input.monthlyInflation, input.monthlyAlternativeRate ?? -Infinity);
  const pv = Math.round(presentValue(installments, discountRate, offset));
  const nominalTotalCents = installments.reduce((a, b) => a + b, 0);
  const saving = cashPriceCents - pv;
  const savingPct = cashPriceCents > 0 ? saving / cashPriceCents : 0;
  // Menos de 0,5 % de diferencia se considera indistinto.
  const best = Math.abs(savingPct) < 0.005 ? "igual" : saving > 0 ? "cuotas" : "contado";

  const irr = impliedRate(cashPriceCents, installments, offset);

  const pct = (x: number) => (x * 100).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const summary =
    best === "igual"
      ? "Da prácticamente lo mismo: elegí según tu liquidez."
      : best === "cuotas"
        ? `Conviene en cuotas: en pesos de hoy pagás ${pct(savingPct)} % menos que de contado.`
        : `Conviene de contado: las cuotas te cuestan ${pct(-savingPct)} % más en pesos de hoy.`;

  return {
    cashPriceCents,
    installments,
    nominalTotalCents,
    presentValueCents: pv,
    discountRate,
    savingWithInstallmentsCents: saving,
    savingPct,
    best,
    impliedMonthlyRate: irr,
    impliedAnnualRate: irr === null ? null : annualFromMonthly(irr),
    summary,
  };
}

/** Compara varias opciones (ej. 3 con recargo vs 6 sin interés) y las ordena de mejor a peor. */
export function rankInstallmentOptions(
  base: Omit<CashVsInstallmentsInput, "option">,
  options: InstallmentOption[],
): (CashVsInstallmentsResult & { option: InstallmentOption })[] {
  return options
    .map((option) => ({ ...compareCashVsInstallments({ ...base, option }), option }))
    .sort((a, b) => a.presentValueCents - b.presentValueCents);
}
