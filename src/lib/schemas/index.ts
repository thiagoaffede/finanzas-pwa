import { z } from "zod";
import { BILL_PROVIDERS, BILL_STATUSES, INDEX_TYPES, PAYMENT_METHODS } from "@/types/finance";

/** Validaciones (Zod) para entradas de la API y salidas de extracción. */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD");
const yearMonth = z.string().regex(/^\d{4}-\d{2}$/, "Mes YYYY-MM");
const cents = z.number().int();

export const transactionInput = z.object({
  date: isoDate,
  amountCents: cents.positive(),
  isIncome: z.boolean().default(false),
  categoryId: z.string().uuid().nullish(),
  category: z.string().max(60).nullish(),
  accountId: z.string().uuid().nullish(),
  paymentMethod: z.enum(PAYMENT_METHODS).default("contado"),
  installmentsCount: z.number().int().min(1).max(60).default(1),
  description: z.string().max(200).nullish(),
  item: z.string().max(120).nullish(),
  notes: z.string().max(1000).nullish(),
  owedByName: z.string().max(120).nullish(),
  owedCents: cents.min(0).default(0),
  clientId: z.string().max(64).nullish(),
  /** Si es cobro de sueldo: mes trabajado. */
  salaryPeriod: yearMonth.nullish(),
});
export type TransactionInput = z.infer<typeof transactionInput>;

export const billInput = z.object({
  provider: z.enum(BILL_PROVIDERS),
  providerLabel: z.string().nullish(),
  accountNumber: z.string().nullish(),
  billingPeriod: yearMonth,
  issueDate: isoDate.nullish(),
  dueDate: isoDate,
  secondDueDate: isoDate.nullish(),
  amountCents: cents.positive(),
  status: z.enum(BILL_STATUSES).default("pending"),
  recurring: z.boolean().default(false),
});
export type BillInput = z.infer<typeof billInput>;

/** Cambios a un movimiento ya cargado. */
export const transactionPatch = z.object({
  date: isoDate.optional(),
  amountCents: cents.positive().optional(),
  description: z.string().max(200).nullish(),
  category: z.string().max(60).nullish(),
  accountId: z.string().uuid().nullish(),
  reimbursedCents: cents.min(0).optional(),
});
export type TransactionPatch = z.infer<typeof transactionPatch>;

/** Cambios a una boleta o vencimiento. */
export const billPatch = z.object({
  providerLabel: z.string().trim().max(80).nullish(),
  amountCents: cents.positive().optional(),
  dueDate: isoDate.optional(),
  billingPeriod: yearMonth.optional(),
  recurring: z.boolean().optional(),
});
export type BillPatch = z.infer<typeof billPatch>;

/** Marcar pagada (con de qué cuenta salió y cuánto) o volver a pendiente. */
export const billPayment = z.object({
  paid: z.boolean(),
  accountId: z.string().uuid().nullish(),
  amountCents: cents.positive().optional(),
  date: isoDate.optional(),
});

export const rentContractInput = z.object({
  label: z.string().default("Alquiler"),
  startDate: isoDate,
  durationMonths: z.number().int().positive().nullish(),
  baseRentCents: cents.positive(),
  adjustmentIntervalMonths: z.number().int().min(1).max(24),
  indexType: z.enum(INDEX_TYPES),
  fixedRate: z.number().min(0).max(10).nullish(),
  lagMonths: z.number().int().min(0).max(6).default(1),
});

/**
 * Lo que devuelve el LLM al leer una boleta (Fase 3). Montos como string tal cual
 * aparecen en el documento; los normaliza `bill-parser`.
 */
export const billExtraction = z.object({
  emisor: z.string(),
  numero_cliente: z.string().nullable().optional(),
  periodo: z.string().nullable(),
  fecha_emision: z.string().nullable().optional(),
  vencimiento: z.string().nullable(),
  segundo_vencimiento: z.string().nullable().optional(),
  monto: z.string(),
  moneda: z.string().default("ARS"),
  confianza: z.number().min(0).max(1).optional(),
});
export type BillExtraction = z.infer<typeof billExtraction>;

export const payslipExtraction = z.object({
  empleador: z.string().nullable().optional(),
  periodo: z.string().nullable(),
  fecha_pago: z.string().nullable().optional(),
  categoria: z.string().nullable().optional(),
  haberes: z.array(z.object({ concepto: z.string(), monto: z.string(), remunerativo: z.boolean() })),
  descuentos: z.array(z.object({ concepto: z.string(), monto: z.string() })),
  total_remunerativo: z.string().nullable().optional(),
  total_no_remunerativo: z.string().nullable().optional(),
  total_descuentos: z.string().nullable().optional(),
  neto: z.string(),
  confianza: z.number().min(0).max(1).optional(),
});
export type PayslipExtraction = z.infer<typeof payslipExtraction>;

/** Respuesta de la API pública de cotizaciones (dolarapi.com). */
export const dollarApiQuote = z.object({
  casa: z.string(),
  nombre: z.string(),
  compra: z.number().nullable(),
  venta: z.number().nullable(),
  fechaActualizacion: z.string(),
});
export const dollarApiResponse = z.array(dollarApiQuote);
