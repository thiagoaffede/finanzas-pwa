import type { Cents, ISODate, Rate, YearMonth } from "@/types/finance";
import { mulCents } from "./money";

/**
 * Estimador de sueldo — Convenio Empleados de Comercio (CCT 130/75).
 *
 * IMPORTANTE: los básicos, sumas no remunerativas y porcentajes NO están hardcodeados
 * como valores oficiales. Se cargan en la tabla de escalas (`payroll_scales`) por vigencia
 * y en `CommerceUnionConfig`. Los valores por defecto son de referencia y deben
 * verificarse contra la escala/paritaria vigente. Ver docs/domain-rules.md.
 */

export type CommerceCategory =
  | "MAESTRANZA_A"
  | "MAESTRANZA_B"
  | "MAESTRANZA_C"
  | "ADMINISTRATIVO_A"
  | "ADMINISTRATIVO_B"
  | "ADMINISTRATIVO_C"
  | "ADMINISTRATIVO_D"
  | "ADMINISTRATIVO_E"
  | "ADMINISTRATIVO_F"
  | "CAJERO_A"
  | "CAJERO_B"
  | "CAJERO_C"
  | "AUXILIAR_A"
  | "AUXILIAR_B"
  | "AUXILIAR_C"
  | "AUXILIAR_ESPECIALIZADO_A"
  | "AUXILIAR_ESPECIALIZADO_B"
  | "VENDEDOR_A"
  | "VENDEDOR_B"
  | "VENDEDOR_C"
  | "VENDEDOR_D";

/** Una fila de la escala salarial con su vigencia. */
export interface ScaleEntry {
  category: CommerceCategory;
  validFrom: ISODate;
  /** null = vigente hasta nueva escala. */
  validTo: ISODate | null;
  /** Básico mensual de jornada completa. */
  basicCents: Cents;
  /** Sumas fijas no remunerativas del acuerdo vigente (jornada completa). */
  nonRemunerativeCents: Cents;
  /** Texto libre: número de acuerdo/resolución de homologación. */
  source?: string;
}

export interface Deduction {
  code: string;
  label: string;
  rate: Rate;
  /** Sobre qué base se aplica. */
  base: "remunerative" | "all";
}

export interface CommerceUnionConfig {
  /** Antigüedad: % del básico por año. */
  seniorityRatePerYear: Rate;
  /** Si la antigüedad también se calcula sobre las sumas no remunerativas. */
  seniorityOnNonRemunerative: boolean;
  /** Presentismo (asistencia y puntualidad) como fracción. */
  presentismoRate: Rate;
  /** Si el presentismo también se calcula sobre las sumas no remunerativas. */
  presentismoOnNonRemunerative: boolean;
  /** Jornada completa en horas semanales (para jornada parcial). */
  fullTimeWeeklyHours: number;
  deductions: Deduction[];
}

/**
 * Valores de referencia. VERIFICAR contra el convenio/acuerdo vigente antes de usar.
 * Todos se pueden sobreescribir desde la configuración del usuario.
 */
export const DEFAULT_COMMERCE_CONFIG: CommerceUnionConfig = {
  seniorityRatePerYear: 0.01,
  seniorityOnNonRemunerative: true,
  presentismoRate: 1 / 12,
  presentismoOnNonRemunerative: true,
  fullTimeWeeklyHours: 48,
  deductions: [
    { code: "JUB", label: "Jubilación (SIPA)", rate: 0.11, base: "remunerative" },
    { code: "PAMI", label: "Ley 19.032 (PAMI)", rate: 0.03, base: "remunerative" },
    { code: "OS", label: "Obra social", rate: 0.03, base: "all" },
    { code: "FAECYS", label: "FAECYS", rate: 0.005, base: "all" },
    { code: "SIND", label: "Sindicato / aporte solidario", rate: 0.02, base: "all" },
  ],
};

export interface SalaryExtra {
  label: string;
  amountCents: Cents;
  remunerative: boolean;
}

export interface CommerceEstimateInput {
  scales: ScaleEntry[];
  category: CommerceCategory;
  /** Fecha del período a liquidar (se usa para elegir la escala vigente). */
  date: ISODate;
  seniorityYears: number;
  /** Horas semanales trabajadas (default jornada completa). */
  weeklyHours?: number;
  /** Si cumple presentismo este mes. */
  presentismo?: boolean;
  extras?: SalaryExtra[];
  config?: Partial<CommerceUnionConfig>;
}

export type LineType = "rem" | "nonrem" | "deduction";

export interface PayLine {
  code: string;
  label: string;
  type: LineType;
  amountCents: Cents;
}

export interface CommerceEstimate {
  scale: ScaleEntry;
  lines: PayLine[];
  remunerativeCents: Cents;
  nonRemunerativeCents: Cents;
  grossCents: Cents;
  deductionsCents: Cents;
  netCents: Cents;
}

/** Devuelve la escala vigente para la categoría en la fecha (la de `validFrom` más reciente). */
export function findScale(
  scales: ScaleEntry[],
  category: CommerceCategory,
  date: ISODate,
): ScaleEntry | null {
  const candidates = scales.filter(
    (s) => s.category === category && s.validFrom <= date && (s.validTo === null || s.validTo >= date),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.validFrom > a.validFrom ? b : a));
}

export function estimateCommerceSalary(input: CommerceEstimateInput): CommerceEstimate {
  const cfg: CommerceUnionConfig = { ...DEFAULT_COMMERCE_CONFIG, ...input.config };
  const scale = findScale(input.scales, input.category, input.date);
  if (!scale) {
    throw new Error(`No hay escala cargada para ${input.category} vigente al ${input.date}`);
  }
  if (input.seniorityYears < 0) throw new Error("La antigüedad no puede ser negativa");

  const hoursFactor = Math.min(1, (input.weeklyHours ?? cfg.fullTimeWeeklyHours) / cfg.fullTimeWeeklyHours);
  const years = Math.floor(input.seniorityYears);
  const seniorityRate = cfg.seniorityRatePerYear * years;
  const presentismo = input.presentismo ?? true;

  const lines: PayLine[] = [];

  const basic = mulCents(scale.basicCents, hoursFactor);
  lines.push({ code: "BAS", label: "Sueldo básico", type: "rem", amountCents: basic });

  const seniority = mulCents(basic, seniorityRate);
  if (seniority > 0)
    lines.push({ code: "ANT", label: `Antigüedad (${years} años)`, type: "rem", amountCents: seniority });

  const remExtras = (input.extras ?? []).filter((e) => e.remunerative);
  for (const e of remExtras) lines.push({ code: "EXT", label: e.label, type: "rem", amountCents: e.amountCents });

  const remBeforePresentismo = basic + seniority + remExtras.reduce((s, e) => s + e.amountCents, 0);
  const presentismoRem = presentismo ? mulCents(basic + seniority, cfg.presentismoRate) : 0;
  if (presentismoRem > 0)
    lines.push({ code: "PRES", label: "Presentismo", type: "rem", amountCents: presentismoRem });
  const remunerativeCents = remBeforePresentismo + presentismoRem;

  // No remunerativos
  const nr = mulCents(scale.nonRemunerativeCents, hoursFactor);
  let nonRemunerativeCents = 0;
  if (nr > 0) {
    lines.push({ code: "NR", label: "Suma no remunerativa (acuerdo)", type: "nonrem", amountCents: nr });
    nonRemunerativeCents += nr;
    const nrSeniority = cfg.seniorityOnNonRemunerative ? mulCents(nr, seniorityRate) : 0;
    if (nrSeniority > 0) {
      lines.push({ code: "NR_ANT", label: "Antigüedad s/ no rem.", type: "nonrem", amountCents: nrSeniority });
      nonRemunerativeCents += nrSeniority;
    }
    const nrPres =
      presentismo && cfg.presentismoOnNonRemunerative ? mulCents(nr + nrSeniority, cfg.presentismoRate) : 0;
    if (nrPres > 0) {
      lines.push({ code: "NR_PRES", label: "Presentismo s/ no rem.", type: "nonrem", amountCents: nrPres });
      nonRemunerativeCents += nrPres;
    }
  }
  for (const e of (input.extras ?? []).filter((x) => !x.remunerative)) {
    lines.push({ code: "NR_EXT", label: e.label, type: "nonrem", amountCents: e.amountCents });
    nonRemunerativeCents += e.amountCents;
  }

  // Descuentos
  let deductionsCents = 0;
  for (const d of cfg.deductions) {
    const base = d.base === "remunerative" ? remunerativeCents : remunerativeCents + nonRemunerativeCents;
    const amount = mulCents(base, d.rate);
    if (amount === 0) continue;
    lines.push({ code: d.code, label: d.label, type: "deduction", amountCents: amount });
    deductionsCents += amount;
  }

  const grossCents = remunerativeCents + nonRemunerativeCents;
  return {
    scale,
    lines,
    remunerativeCents,
    nonRemunerativeCents,
    grossCents,
    deductionsCents,
    netCents: grossCents - deductionsCents,
  };
}

/** Recibo de sueldo real (importado o cargado a mano). */
export interface PayslipTotals {
  period: YearMonth;
  remunerativeCents: Cents;
  nonRemunerativeCents: Cents;
  deductionsCents: Cents;
  netCents: Cents;
}

export interface PayslipComparison {
  field: keyof Omit<PayslipTotals, "period">;
  label: string;
  estimatedCents: Cents;
  actualCents: Cents;
  diffCents: Cents;
  diffPct: number | null;
  significant: boolean;
}

/** Compara el estimado contra lo liquidado. Diferencias mayores a `tolerance` se marcan. */
export function compareEstimateWithPayslip(
  estimate: CommerceEstimate,
  payslip: PayslipTotals,
  tolerance: Rate = 0.01,
): PayslipComparison[] {
  const rows: [PayslipComparison["field"], string, Cents][] = [
    ["remunerativeCents", "Remunerativo", estimate.remunerativeCents],
    ["nonRemunerativeCents", "No remunerativo", estimate.nonRemunerativeCents],
    ["deductionsCents", "Descuentos", estimate.deductionsCents],
    ["netCents", "Neto", estimate.netCents],
  ];
  return rows.map(([field, label, est]) => {
    const actual = payslip[field];
    const diff = actual - est;
    const diffPct = est !== 0 ? diff / est : null;
    return {
      field,
      label,
      estimatedCents: est,
      actualCents: actual,
      diffCents: diff,
      diffPct,
      significant: diffPct === null ? diff !== 0 : Math.abs(diffPct) > tolerance,
    };
  });
}
