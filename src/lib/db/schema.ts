import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Esquema de base de datos (PostgreSQL / Neon) con Drizzle.
 *
 * - Montos: SIEMPRE `bigint` en centavos (`*_cents`). Nada de float/decimal para plata.
 * - Índices (ICL/IPC) y tasas: `numeric` para no perder precisión.
 * - Fechas de negocio: `date` (sin hora). Auditoría: `timestamptz`.
 * - App personal de un solo usuario: no hay tabla de usuarios todavía.
 */

const cents = (name: string) => bigint(name, { mode: "number" });
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

// ─── Enums ──────────────────────────────────────────────────────────────────
export const currencyEnum = pgEnum("currency", ["ARS", "USD"]);
export const accountKindEnum = pgEnum("account_kind", ["efectivo", "banco", "billetera", "tarjeta", "reserva"]);
export const billProviderEnum = pgEnum("bill_provider", ["EDES", "CAMUZZI", "BVC", "PERSONAL", "OTRO"]);
export const billStatusEnum = pgEnum("bill_status", ["pending", "paid", "overdue"]);
export const paymentMethodEnum = pgEnum("payment_method", ["contado", "debito", "tarjeta", "cuotas", "transferencia"]);
export const indexTypeEnum = pgEnum("index_type", ["ICL", "IPC", "FIXED"]);
export const documentKindEnum = pgEnum("document_kind", ["bill", "payslip"]);
export const documentStatusEnum = pgEnum("document_status", ["uploaded", "parsed", "confirmed", "failed"]);

// ─── Cuentas y categorías ───────────────────────────────────────────────────
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: accountKindEnum("kind").notNull(),
  currency: currencyEnum("currency").notNull().default("ARS"),
  openingBalanceCents: cents("opening_balance_cents").notNull().default(0),
  /** Tarjetas: día de cierre y de vencimiento del resumen. */
  closingDay: integer("closing_day"),
  dueDay: integer("due_day"),
  archived: boolean("archived").notNull().default(false),
  ...timestamps,
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  icon: text("icon"),
  color: text("color"),
  /** Presupuesto mensual opcional. */
  monthlyBudgetCents: cents("monthly_budget_cents"),
});

// ─── Movimientos, cuotas y gastos compartidos ───────────────────────────────
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    /** Positivo = gasto. Los ingresos van como `isIncome = true`. */
    amountCents: cents("amount_cents").notNull(),
    currency: currencyEnum("currency").notNull().default("ARS"),
    isIncome: boolean("is_income").notNull().default(false),
    categoryId: uuid("category_id").references(() => categories.id),
    accountId: uuid("account_id").references(() => accounts.id),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("contado"),
    installmentsCount: integer("installments_count").notNull().default(1),
    /** Descripción libre / ítem (para historial de precios). */
    description: text("description"),
    item: text("item"),
    quantity: numeric("quantity", { precision: 12, scale: 3 }),
    notes: text("notes"),
    /** Gastos compartidos / a recuperar. */
    myShareCents: cents("my_share_cents"),
    owedByName: text("owed_by_name"),
    owedCents: cents("owed_cents").notNull().default(0),
    reimbursedCents: cents("reimbursed_cents").notNull().default(0),
    /** Para la cola offline: id generado en el cliente, evita duplicados al sincronizar. */
    clientId: text("client_id").unique(),
    ...timestamps,
  },
  (t) => [index("transactions_date_idx").on(t.date), index("transactions_category_idx").on(t.categoryId)],
);

/** Cuotas futuras generadas automáticamente desde un gasto en cuotas. */
export const installments = pgTable(
  "installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    total: integer("total").notNull(),
    dueDate: date("due_date").notNull(),
    amountCents: cents("amount_cents").notNull(),
    paid: boolean("paid").notNull().default(false),
  },
  (t) => [index("installments_due_idx").on(t.dueDate), uniqueIndex("installments_tx_num_idx").on(t.transactionId, t.number)],
);

// ─── Servicios (boletas) ────────────────────────────────────────────────────
export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: billProviderEnum("provider").notNull(),
    providerLabel: text("provider_label"),
    accountNumber: text("account_number"),
    billingPeriod: text("billing_period").notNull(), // YYYY-MM
    issueDate: date("issue_date"),
    dueDate: date("due_date").notNull(),
    secondDueDate: date("second_due_date"),
    amountCents: cents("amount_cents").notNull(),
    status: billStatusEnum("status").notNull().default("pending"),
    paidAt: date("paid_at"),
    sourceDocumentId: uuid("source_document_id").references(() => documents.id),
    rawExtractedJson: jsonb("raw_extracted_json"),
    ...timestamps,
  },
  (t) => [index("bills_due_idx").on(t.dueDate), index("bills_provider_period_idx").on(t.provider, t.billingPeriod)],
);

// ─── Sueldo: escalas y recibos ──────────────────────────────────────────────
export const payrollScales = pgTable(
  "payroll_scales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agreement: text("agreement").notNull().default("CCT 130/75"),
    category: text("category").notNull(), // ej. AUXILIAR_C
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    basicCents: cents("basic_cents").notNull(),
    nonRemunerativeCents: cents("non_remunerative_cents").notNull().default(0),
    source: text("source"),
  },
  (t) => [uniqueIndex("payroll_scales_cat_from_idx").on(t.agreement, t.category, t.validFrom)],
);

/** Datos del empleado para el estimador (una fila). */
export const payrollProfile = pgTable("payroll_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category").notNull().default("AUXILIAR_C"),
  hireDate: date("hire_date").notNull(),
  weeklyHours: integer("weekly_hours").notNull().default(48),
  /** Overrides de CommerceUnionConfig (antigüedad, presentismo, descuentos). */
  configOverrides: jsonb("config_overrides"),
  ...timestamps,
});

export const payslips = pgTable("payslips", {
  id: uuid("id").primaryKey().defaultRandom(),
  period: text("period").notNull().unique(), // YYYY-MM
  employer: text("employer"),
  paymentDate: date("payment_date"),
  remunerativeCents: cents("remunerative_cents").notNull(),
  nonRemunerativeCents: cents("non_remunerative_cents").notNull().default(0),
  deductionsCents: cents("deductions_cents").notNull(),
  netCents: cents("net_cents").notNull(),
  /** Detalle línea por línea: [{code,label,type,amountCents}] */
  lines: jsonb("lines"),
  sourceDocumentId: uuid("source_document_id").references(() => documents.id),
  rawExtractedJson: jsonb("raw_extracted_json"),
  ...timestamps,
});

// ─── Alquiler e índices ─────────────────────────────────────────────────────
export const rentContracts = pgTable("rent_contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull().default("Alquiler"),
  startDate: date("start_date").notNull(),
  durationMonths: integer("duration_months"),
  baseRentCents: cents("base_rent_cents").notNull(),
  adjustmentIntervalMonths: integer("adjustment_interval_months").notNull(),
  indexType: indexTypeEnum("index_type").notNull(),
  fixedRate: numeric("fixed_rate", { precision: 10, scale: 6 }),
  lagMonths: integer("lag_months").notNull().default(1),
  dueDay: integer("due_day").notNull().default(10),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** Valores de índices: ICL diario (date) e IPC mensual (date = primer día del mes, value = variación). */
export const indexValues = pgTable(
  "index_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    indexType: indexTypeEnum("index_type").notNull(),
    date: date("date").notNull(),
    value: numeric("value", { precision: 18, scale: 8 }).notNull(),
    source: text("source"),
  },
  (t) => [uniqueIndex("index_values_type_date_idx").on(t.indexType, t.date)],
);

// ─── Objetivos ──────────────────────────────────────────────────────────────
export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  targetCents: cents("target_cents").notNull(),
  currency: currencyEnum("currency").notNull().default("ARS"),
  targetDate: date("target_date"),
  monthlyContributionCents: cents("monthly_contribution_cents"),
  accountId: uuid("account_id").references(() => accounts.id),
  archived: boolean("archived").notNull().default(false),
  ...timestamps,
});

export const goalContributions = pgTable("goal_contributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  amountCents: cents("amount_cents").notNull(),
});

// ─── Documentos (PDF/fotos) ─────────────────────────────────────────────────
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: documentKindEnum("kind").notNull(),
  fileUrl: text("file_url"),
  mimeType: text("mime_type"),
  status: documentStatusEnum("status").notNull().default("uploaded"),
  extractedJson: jsonb("extracted_json"),
  error: text("error"),
  ...timestamps,
});

// ─── Mercado y configuración ────────────────────────────────────────────────
/** Caché de cotizaciones del dólar (una fila por casa y momento). */
export const marketQuotes = pgTable(
  "market_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    house: text("house").notNull(), // oficial, blue, bolsa (MEP), contadoconliqui, cripto, tarjeta
    buyCents: cents("buy_cents"),
    sellCents: cents("sell_cents"),
    quotedAt: timestamp("quoted_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("market_quotes_house_time_idx").on(t.house, t.fetchedAt)],
);

/** Preferencias: inflación mensual estimada, colchón, tasa alternativa, etc. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
