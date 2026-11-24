/**
 * Tipos de dominio compartidos.
 *
 * Convenciones:
 * - Todo monto de dinero es un entero en CENTAVOS (`Cents`). Nunca floats para plata.
 * - Fechas como string ISO `YYYY-MM-DD` (`ISODate`) y meses como `YYYY-MM` (`YearMonth`),
 *   para evitar problemas de zona horaria con `Date`.
 * - Tasas como fracción decimal: 0.03 = 3 %.
 */

export type Cents = number;
export type ISODate = string; // "2026-11-24"
export type YearMonth = string; // "2026-11"
export type Rate = number; // 0.03 = 3 %

export const BILL_PROVIDERS = ["EDES", "CAMUZZI", "BVC", "PERSONAL", "OTRO"] as const;
export type BillProvider = (typeof BILL_PROVIDERS)[number];

export const BILL_STATUSES = ["pending", "paid", "overdue"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const PAYMENT_METHODS = ["contado", "debito", "tarjeta", "cuotas", "transferencia"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const INDEX_TYPES = ["ICL", "IPC", "FIXED"] as const;
export type IndexType = (typeof INDEX_TYPES)[number];

export const CURRENCIES = ["ARS", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ACCOUNT_KINDS = ["efectivo", "banco", "billetera", "tarjeta", "reserva"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export type CashflowKind =
  | "income"
  | "bill"
  | "installment"
  | "rent"
  | "goal"
  | "expense"
  | "other";

export type Direction = "in" | "out";

export type DueBucket = "paid" | "overdue" | "today" | "next3" | "week" | "later";
