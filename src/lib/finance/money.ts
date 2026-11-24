import type { Cents, Rate } from "@/types/finance";

/** Convierte pesos (puede tener decimales) a centavos enteros. */
export function toCents(amount: number): Cents {
  return Math.round(amount * 100);
}

/** Convierte un string tipo "1.234,56" o "1234.56" a centavos. Devuelve null si no se puede leer. */
export function parseAmountToCents(input: string): Cents | null {
  const s = input.trim().replace(/\s|\$/g, "");
  if (!s) return null;
  let normalized = s;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // El separador que aparece último es el decimal.
    normalized =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (hasComma) {
    normalized = s.replace(",", ".");
  } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234.567" sin decimales: puntos de miles.
    normalized = s.replace(/\./g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? toCents(n) : null;
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

/** Multiplica un monto por una tasa/coeficiente y redondea al centavo. */
export function mulCents(cents: Cents, factor: number): Cents {
  return Math.round(cents * factor);
}

export function applyRate(cents: Cents, rate: Rate): Cents {
  return mulCents(cents, 1 + rate);
}

export function sumCents(values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Reparte un total en `parts` cuotas enteras que suman exactamente el total
 * (el resto de centavos va a las primeras cuotas).
 */
export function splitCents(total: Cents, parts: number): Cents[] {
  if (!Number.isInteger(parts) || parts <= 0) throw new Error("parts debe ser entero positivo");
  const base = Math.trunc(total / parts);
  let remainder = total - base * parts;
  return Array.from({ length: parts }, () => {
    if (remainder > 0) {
      remainder--;
      return base + 1;
    }
    if (remainder < 0) {
      remainder++;
      return base - 1;
    }
    return base;
  });
}

const arsFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const arsFormatterDecimals = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const usdFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatARS(cents: Cents, opts: { decimals?: boolean } = {}): string {
  return (opts.decimals ? arsFormatterDecimals : arsFormatter).format(cents / 100);
}

export function formatUSD(cents: Cents): string {
  return usdFormatter.format(cents / 100);
}

export function formatPct(rate: Rate, digits = 1): string {
  return `${(rate * 100).toLocaleString("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

/** Tasa mensual equivalente a una anual compuesta. */
export function monthlyFromAnnual(annual: Rate): Rate {
  return Math.pow(1 + annual, 1 / 12) - 1;
}

/** Tasa anual efectiva equivalente a una mensual. */
export function annualFromMonthly(monthly: Rate): Rate {
  return Math.pow(1 + monthly, 12) - 1;
}
