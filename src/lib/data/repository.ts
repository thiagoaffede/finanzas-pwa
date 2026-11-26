import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import type { Db } from "./db-type";
import type { BillProvider, ISODate, Rate, YearMonth } from "@/types/finance";
import type { CommerceCategory, CommerceUnionConfig, PayLine, ScaleEntry } from "@/lib/finance/commerce-union";
import type { IndexData, RentContract } from "@/lib/finance/rent-adjustment";
import type { BillInput, BillPatch, TransactionInput, TransactionPatch, TransferInput } from "@/lib/schemas";
import { addMonths, addMonthsToDate, lastDayOfMonth } from "@/lib/finance/dates";
import { splitCents } from "@/lib/finance/money";
import { cardInstallmentDue } from "@/lib/finance/card";
import type { IndicesSyncResult } from "@/lib/market/official-indices";
import type { ScalesSyncResult } from "@/lib/market/faecys-sync";
import type { PlanSplit } from "@/lib/finance/money-plan";
import type { MoodleSyncResult } from "@/lib/study/moodle-sync";

/** Acceso a datos. Funciones chicas sobre Drizzle; la lógica de negocio vive en lib/finance. */

// ─── Configuración ──────────────────────────────────────────────────────────
export interface AppSettings {
  monthlyInflation: Rate;
  monthlyAlternativeRate: Rate;
  bufferCents: number;
  /** Ingreso neto manual. Si es null se usa el último recibo o el estimado por convenio. */
  netIncomeCents: number | null;
  openingBalanceCents: number;
  minBalanceCents: number;
  /** Día hábil del mes en que cobrás el sueldo (3 = tercer día hábil). */
  paydayBusinessDay: number;
  /** Tope mensual por categoría (centavos). */
  budgets: Record<string, number>;
  /** Días antes de cada vencimiento en que avisamos (0 = el mismo día). */
  reminderDays: number[];
  /** Avisos de presupuesto ya enviados: "YYYY-MM:Categoría" → 80 | 100. */
  budgetAlerts: Record<string, number>;
  /** Cotización para valuar dólares: "bolsa" (MEP), "oficial", "blue", "cripto". */
  usdHouse: string;
  /** Cotización cargada a mano (centavos por dólar) por si no hay conexión con la API. */
  usdManualCents: number | null;
  /** Cuándo se bajó el último backup completo (ISO). */
  lastBackupAt: string | null;
  /** Última actualización automática de IPC (INDEC) e ICL (BCRA). */
  indicesSync: IndicesSyncResult | null;
  /** Última revisión de la circular de escalas de FAECYS. */
  scalesSync: ScalesSyncResult | null;
  /** Link privado de exportación del calendario de Moodle (iCal). No es la contraseña. */
  moodleIcalUrl: string | null;
  /** Última sincronización con ese calendario. */
  moodleSync: MoodleSyncResult | null;
  /** Reparto del sueldo entre gastos necesarios, libres y ahorro (null = 55/25/20). */
  planSplit: PlanSplit | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  monthlyInflation: 0.025,
  monthlyAlternativeRate: 0.022,
  bufferCents: 0,
  netIncomeCents: null,
  openingBalanceCents: 0,
  minBalanceCents: 0,
  paydayBusinessDay: 3,
  budgets: {},
  reminderDays: [3, 1, 0],
  budgetAlerts: {},
  usdHouse: "bolsa",
  usdManualCents: null,
  lastBackupAt: null,
  indicesSync: null,
  scalesSync: null,
  planSplit: null,
  moodleIcalUrl: null,
  moodleSync: null,
};

export async function getSettings(db: Db): Promise<AppSettings> {
  const rows = await db.select().from(s.settings);
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in out) (out as unknown as Record<string, unknown>)[r.key] = r.value;
  return out;
}

export async function saveSettings(db: Db, patch: Partial<AppSettings>): Promise<AppSettings> {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS) || value === undefined) continue;
    // null = volver al valor por defecto (la columna jsonb no admite NULL).
    if (value === null) {
      await db.delete(s.settings).where(eq(s.settings.key, key));
      continue;
    }
    await db
      .insert(s.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: s.settings.key, set: { value, updatedAt: new Date() } });
  }
  return getSettings(db);
}

// ─── Escalas salariales ─────────────────────────────────────────────────────
export async function listScales(db: Db): Promise<(ScaleEntry & { id: string })[]> {
  const rows = await db.select().from(s.payrollScales).orderBy(asc(s.payrollScales.category), desc(s.payrollScales.validFrom));
  return rows.map((r) => ({
    id: r.id,
    category: r.category as CommerceCategory,
    validFrom: r.validFrom,
    validTo: r.validTo,
    basicCents: r.basicCents,
    nonRemunerativeCents: r.nonRemunerativeCents,
    oneTimeNonRemunerativeCents: r.oneTimeNonRemunerativeCents,
    source: r.source ?? undefined,
  }));
}

export async function upsertScale(db: Db, e: ScaleEntry) {
  const values = {
    category: e.category,
    validFrom: e.validFrom,
    validTo: e.validTo,
    basicCents: e.basicCents,
    nonRemunerativeCents: e.nonRemunerativeCents,
    oneTimeNonRemunerativeCents: e.oneTimeNonRemunerativeCents ?? 0,
    source: e.source ?? null,
  };
  const [row] = await db
    .insert(s.payrollScales)
    .values(values)
    .onConflictDoUpdate({ target: [s.payrollScales.agreement, s.payrollScales.category, s.payrollScales.validFrom], set: values })
    .returning();
  return row;
}

/** Muchas escalas de una (la circular de FAECYS trae todas las categorías, mes por mes). */
export async function upsertScales(db: Db, entries: ScaleEntry[]) {
  const rows = entries.map((e) => ({
    category: e.category,
    validFrom: e.validFrom,
    validTo: e.validTo,
    basicCents: e.basicCents,
    nonRemunerativeCents: e.nonRemunerativeCents,
    oneTimeNonRemunerativeCents: e.oneTimeNonRemunerativeCents ?? 0,
    source: e.source ?? null,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    await db
      .insert(s.payrollScales)
      .values(rows.slice(i, i + 200))
      .onConflictDoUpdate({
        target: [s.payrollScales.agreement, s.payrollScales.category, s.payrollScales.validFrom],
        set: {
          validTo: sql`excluded.valid_to`,
          basicCents: sql`excluded.basic_cents`,
          nonRemunerativeCents: sql`excluded.non_remunerative_cents`,
          oneTimeNonRemunerativeCents: sql`excluded.one_time_non_remunerative_cents`,
          source: sql`excluded.source`,
        },
      });
  }
  return rows.length;
}

export async function deleteScale(db: Db, id: string) {
  await db.delete(s.payrollScales).where(eq(s.payrollScales.id, id));
}

// ─── Perfil y recibos ───────────────────────────────────────────────────────
export interface PayrollProfile {
  category: CommerceCategory;
  hireDate: ISODate;
  weeklyHours: number;
  configOverrides: Partial<CommerceUnionConfig> | null;
}

export async function getPayrollProfile(db: Db): Promise<PayrollProfile | null> {
  const [r] = await db.select().from(s.payrollProfile).limit(1);
  if (!r) return null;
  return {
    category: r.category as CommerceCategory,
    hireDate: r.hireDate,
    weeklyHours: r.weeklyHours,
    configOverrides: (r.configOverrides as Partial<CommerceUnionConfig> | null) ?? null,
  };
}

export async function savePayrollProfile(db: Db, p: PayrollProfile) {
  const [existing] = await db.select({ id: s.payrollProfile.id }).from(s.payrollProfile).limit(1);
  if (existing) await db.update(s.payrollProfile).set({ ...p, updatedAt: new Date() }).where(eq(s.payrollProfile.id, existing.id));
  else await db.insert(s.payrollProfile).values(p);
  return getPayrollProfile(db);
}

export interface PayslipRecord {
  period: YearMonth;
  employer?: string | null;
  paymentDate?: ISODate | null;
  remunerativeCents: number;
  nonRemunerativeCents: number;
  deductionsCents: number;
  netCents: number;
  lines?: PayLine[];
  rawExtractedJson?: unknown;
  sourceDocumentId?: string | null;
}

export async function upsertPayslip(db: Db, p: PayslipRecord) {
  const values = {
    period: p.period,
    employer: p.employer ?? null,
    paymentDate: p.paymentDate ?? null,
    remunerativeCents: p.remunerativeCents,
    nonRemunerativeCents: p.nonRemunerativeCents,
    deductionsCents: p.deductionsCents,
    netCents: p.netCents,
    lines: p.lines ?? null,
    rawExtractedJson: p.rawExtractedJson ?? null,
    sourceDocumentId: p.sourceDocumentId ?? null,
  };
  const [row] = await db
    .insert(s.payslips)
    .values(values)
    .onConflictDoUpdate({ target: s.payslips.period, set: { ...values, updatedAt: new Date() } })
    .returning();
  if (p.sourceDocumentId) await updateDocument(db, p.sourceDocumentId, { status: "confirmed" });
  return row;
}

export async function listPayslips(db: Db, limit = 12) {
  return db.select().from(s.payslips).orderBy(desc(s.payslips.period)).limit(limit);
}

// ─── Alquiler e índices ─────────────────────────────────────────────────────
export async function getActiveRentContract(db: Db): Promise<(RentContract & { id: string; dueDay: number }) | null> {
  const [r] = await db.select().from(s.rentContracts).where(eq(s.rentContracts.active, true)).orderBy(desc(s.rentContracts.startDate)).limit(1);
  if (!r) return null;
  return {
    id: r.id,
    startDate: r.startDate,
    baseRentCents: r.baseRentCents,
    adjustmentIntervalMonths: r.adjustmentIntervalMonths,
    indexType: r.indexType,
    fixedRate: r.fixedRate === null ? undefined : Number(r.fixedRate),
    durationMonths: r.durationMonths ?? undefined,
    lagMonths: r.lagMonths,
    dueDay: r.dueDay,
  };
}

/** Guarda el contrato como el único activo. */
export async function saveRentContract(db: Db, c: RentContract & { dueDay?: number }) {
  await db.update(s.rentContracts).set({ active: false }).where(eq(s.rentContracts.active, true));
  const [row] = await db
    .insert(s.rentContracts)
    .values({
      startDate: c.startDate,
      baseRentCents: c.baseRentCents,
      adjustmentIntervalMonths: c.adjustmentIntervalMonths,
      indexType: c.indexType,
      fixedRate: c.fixedRate === undefined ? null : String(c.fixedRate),
      durationMonths: c.durationMonths ?? null,
      lagMonths: c.lagMonths ?? 1,
      dueDay: c.dueDay ?? 10,
    })
    .returning();
  return row;
}

/** ICL: fecha → valor. IPC: se guarda con fecha = primer día del mes y valor = variación mensual. */
export async function getIndices(db: Db): Promise<IndexData> {
  const rows = await db.select().from(s.indexValues).orderBy(asc(s.indexValues.date));
  return {
    icl: rows.filter((r) => r.indexType === "ICL").map((r) => ({ date: r.date, value: Number(r.value) })),
    ipc: rows.filter((r) => r.indexType === "IPC").map((r) => ({ month: r.date.slice(0, 7), rate: Number(r.value) })),
  };
}

export async function upsertIndexValues(db: Db, indexType: "ICL" | "IPC", points: { date: ISODate; value: number }[], source?: string) {
  // Una fila por fecha (si se repite, gana la última) y de a lotes: la serie completa del ICL son miles de días.
  const byDate = new Map<string, string>();
  for (const p of points) byDate.set(indexType === "IPC" ? `${p.date.slice(0, 7)}-01` : p.date, String(p.value));
  const rows = [...byDate].map(([date, value]) => ({ indexType, date, value, source: source ?? null }));
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(s.indexValues)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({ target: [s.indexValues.indexType, s.indexValues.date], set: { value: sql`excluded.value`, source: sql`excluded.source` } });
  }
  return points.length;
}

export async function deleteIndexValue(db: Db, indexType: "ICL" | "IPC", date: ISODate) {
  await db.delete(s.indexValues).where(and(eq(s.indexValues.indexType, indexType), eq(s.indexValues.date, date)));
}

// ─── Boletas ────────────────────────────────────────────────────────────────
export async function listBills(db: Db, opts: { from?: ISODate; to?: ISODate } = {}) {
  const conds = [];
  if (opts.from) conds.push(gte(s.bills.dueDate, opts.from));
  if (opts.to) conds.push(lte(s.bills.dueDate, opts.to));
  return db.select().from(s.bills).where(conds.length ? and(...conds) : undefined).orderBy(asc(s.bills.dueDate));
}

export async function billHistory(db: Db, provider: BillProvider) {
  return db
    .select({ period: s.bills.billingPeriod, amountCents: s.bills.amountCents })
    .from(s.bills)
    .where(eq(s.bills.provider, provider))
    .orderBy(asc(s.bills.billingPeriod));
}

export async function createBill(db: Db, b: Omit<BillInput, "recurring" | "recurrenceMonths"> & { recurring?: boolean; recurrenceMonths?: number; rawExtractedJson?: unknown; sourceDocumentId?: string | null }) {
  const [row] = await db.insert(s.bills).values(b).returning();
  if (b.sourceDocumentId) await updateDocument(db, b.sourceDocumentId, { status: "confirmed" });
  return row;
}

export async function updateBill(db: Db, id: string, patch: BillPatch) {
  const [row] = await db.update(s.bills).set({ ...patch, updatedAt: new Date() }).where(eq(s.bills.id, id)).returning();
  return row ?? null;
}

/** Borra la boleta y el pago que se haya registrado (la plata vuelve a la cuenta). */
export async function deleteBill(db: Db, id: string) {
  await db.delete(s.transactions).where(eq(s.transactions.billId, id));
  const [row] = await db.delete(s.bills).where(eq(s.bills.id, id)).returning({ id: s.bills.id });
  return row ?? null;
}

/**
 * Marca una boleta como pagada: registra el pago como movimiento (sale de la cuenta elegida)
 * y, si es un gasto fijo, deja creado el del mes siguiente con el mismo monto para ajustar.
 * Al desmarcarla se borra ese movimiento.
 */
export async function setBillPaid(
  db: Db,
  id: string,
  paid: boolean,
  paidAt: ISODate,
  opts: { accountId?: string | null; amountCents?: number } = {},
) {
  const [bill] = await db.select().from(s.bills).where(eq(s.bills.id, id));
  if (!bill) return null;
  await db.delete(s.transactions).where(eq(s.transactions.billId, id));
  const amountCents = opts.amountCents ?? bill.amountCents;
  const [row] = await db
    .update(s.bills)
    .set({ status: paid ? "paid" : "pending", paidAt: paid ? paidAt : null, amountCents, updatedAt: new Date() })
    .where(eq(s.bills.id, id))
    .returning();
  if (!paid) return row;

  await db.insert(s.transactions).values({
    date: paidAt,
    amountCents,
    category: bill.category ?? "Servicios",
    description: billName(bill),
    accountId: opts.accountId ?? null,
    paymentMethod: "debito",
    billId: id,
  });
  if (bill.recurring) {
    const every = Math.max(1, bill.recurrenceMonths);
    const nextPeriod = addMonths(bill.billingPeriod, every);
    const same = and(
      eq(s.bills.provider, bill.provider),
      bill.providerLabel ? eq(s.bills.providerLabel, bill.providerLabel) : sql`${s.bills.providerLabel} is null`,
      eq(s.bills.billingPeriod, nextPeriod),
    );
    const [exists] = await db.select({ id: s.bills.id }).from(s.bills).where(same);
    if (!exists) {
      await db.insert(s.bills).values({
        provider: bill.provider,
        providerLabel: bill.providerLabel,
        accountNumber: bill.accountNumber,
        billingPeriod: nextPeriod,
        dueDate: addMonthsToDate(bill.dueDate, every),
        amountCents,
        recurring: true,
        recurrenceMonths: every,
        category: bill.category,
      });
    }
  }
  return row;
}

const PROVIDER_LABEL: Record<string, string> = { EDES: "EDES (luz)", CAMUZZI: "Camuzzi (gas)", BVC: "BVC (agua)", PERSONAL: "Personal" };
function billName(b: { provider: string; providerLabel: string | null }) {
  return b.provider === "OTRO" ? b.providerLabel || "Vencimiento" : PROVIDER_LABEL[b.provider] ?? b.provider;
}

// ─── Movimientos y cuotas ───────────────────────────────────────────────────
/** Cuotas (o el único pago con tarjeta) de un gasto: se pagan con el resumen, según el cierre de la tarjeta. */
async function writeInstallments(db: Db, tx: { id: string; date: string; amountCents: number; installmentsCount: number; paymentMethod: string; accountId: string | null }) {
  // Las cuotas ya pagadas con un resumen siguen pagadas aunque se edite la compra.
  const before = await db.select({ number: s.installments.number, paid: s.installments.paid, paidTransferId: s.installments.paidTransferId }).from(s.installments).where(eq(s.installments.transactionId, tx.id));
  const wasPaid = new Map(before.filter((b) => b.paid).map((b) => [b.number, b.paidTransferId]));
  await db.delete(s.installments).where(eq(s.installments.transactionId, tx.id));
  const onCard = tx.paymentMethod === "cuotas" || tx.paymentMethod === "tarjeta";
  if (!onCard) return;
  const count = tx.paymentMethod === "cuotas" ? tx.installmentsCount : 1;
  const [card] = tx.accountId
    ? await db.select({ closingDay: s.accounts.closingDay, dueDay: s.accounts.dueDay }).from(s.accounts).where(eq(s.accounts.id, tx.accountId))
    : [];
  const amounts = splitCents(tx.amountCents, count);
  await db.insert(s.installments).values(
    amounts.map((amountCents, i) => ({
      transactionId: tx.id,
      number: i + 1,
      total: count,
      dueDate: cardInstallmentDue(tx.date, i + 1, card),
      amountCents,
      paid: wasPaid.has(i + 1),
      paidTransferId: wasPaid.get(i + 1) ?? null,
    })),
  );
}

export async function createTransaction(db: Db, tx: TransactionInput) {
  const installmentsCount = tx.paymentMethod === "cuotas" ? tx.installmentsCount : 1;
  const [created] = await db
    .insert(s.transactions)
    .values({ ...tx, installmentsCount })
    .onConflictDoNothing({ target: s.transactions.clientId })
    .returning();
  if (!created) return null; // ya existía (reintento de la cola offline)
  if (!created.isIncome) await writeInstallments(db, created);
  return created;
}

export async function listTransactions(db: Db, opts: { month?: YearMonth; from?: ISODate; to?: ISODate; limit?: number } = {}) {
  const from = opts.month ? `${opts.month}-01` : opts.from;
  const to = opts.month ? lastDayOfMonth(opts.month) : opts.to;
  const conds = [];
  if (from) conds.push(gte(s.transactions.date, from));
  if (to) conds.push(lte(s.transactions.date, to));
  return db
    .select()
    .from(s.transactions)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(s.transactions.date), desc(s.transactions.createdAt))
    .limit(opts.limit ?? 1000);
}

/**
 * Compras con tarjeta que todavía tienen cuotas por pagar (desde `from`), con todas sus cuotas
 * para saber cuántas van y cuánto falta.
 */
export async function listCardPurchases(db: Db, from: ISODate) {
  const open = db.select({ id: s.installments.transactionId }).from(s.installments).where(gte(s.installments.dueDate, from));
  return db
    .select({
      transactionId: s.installments.transactionId,
      number: s.installments.number,
      total: s.installments.total,
      dueDate: s.installments.dueDate,
      amountCents: s.installments.amountCents,
      description: s.transactions.description,
      purchaseDate: s.transactions.date,
      purchaseCents: s.transactions.amountCents,
      accountId: s.transactions.accountId,
      paid: s.installments.paid,
    })
    .from(s.installments)
    .innerJoin(s.transactions, eq(s.installments.transactionId, s.transactions.id))
    .where(sql`${s.installments.transactionId} in ${open}`)
    .orderBy(asc(s.installments.dueDate));
}

/** Cuotas futuras con la descripción del gasto. */
export async function listInstallments(db: Db, from: ISODate) {
  return db
    .select({
      id: s.installments.id,
      dueDate: s.installments.dueDate,
      amountCents: s.installments.amountCents,
      number: s.installments.number,
      total: s.installments.total,
      paid: s.installments.paid,
      label: sql<string>`coalesce(${s.transactions.description}, 'Compra en cuotas')`,
    })
    .from(s.installments)
    .innerJoin(s.transactions, eq(s.installments.transactionId, s.transactions.id))
    .where(and(gte(s.installments.dueDate, from), eq(s.installments.paid, false)))
    .orderBy(asc(s.installments.dueDate));
}

/**
 * Cuotas que vencen en el mes, de compras en 2 o más cuotas, con su categoría (pagadas o no).
 * Para el presupuesto: cada cuota cuenta en el mes en que vence, no la compra entera.
 */
export async function listMonthCuotas(db: Db, month: YearMonth) {
  const rows = await db
    .select({
      category: s.transactions.category,
      amountCents: s.installments.amountCents,
      purchaseCents: s.transactions.amountCents,
      owedCents: s.transactions.owedCents,
    })
    .from(s.installments)
    .innerJoin(s.transactions, eq(s.installments.transactionId, s.transactions.id))
    .where(
      and(
        gte(s.installments.dueDate, `${month}-01`),
        lte(s.installments.dueDate, lastDayOfMonth(month)),
        eq(s.transactions.paymentMethod, "cuotas"),
        sql`${s.installments.total} > 1`,
        eq(s.transactions.isIncome, false),
      ),
    );
  return rows.map((r) => ({
    category: r.category ?? "Otros",
    amountCents: r.amountCents,
    owedCents: r.purchaseCents > 0 ? Math.round((r.owedCents * r.amountCents) / r.purchaseCents) : 0,
  }));
}

/** Resumen de tarjeta: lo que vence en una fecha, impago. */
export async function listStatementInstallments(db: Db, cardAccountId: string, dueDate: ISODate) {
  return db
    .select({ id: s.installments.id, amountCents: s.installments.amountCents })
    .from(s.installments)
    .innerJoin(s.transactions, eq(s.installments.transactionId, s.transactions.id))
    .where(and(eq(s.transactions.accountId, cardAccountId), eq(s.installments.dueDate, dueDate), eq(s.installments.paid, false)));
}

/**
 * Paga el resumen de una tarjeta: transfiere desde una cuenta a la tarjeta (baja la deuda)
 * y marca como pagadas las cuotas de ese vencimiento. Borrar la transferencia las deja impagas otra vez.
 */
export async function payCardStatement(
  db: Db,
  p: { cardAccountId: string; dueDate: ISODate; fromAccountId: string; amountCents: number; date: ISODate },
): Promise<{ ok: true; transferId: string; installments: number } | { ok: false; error: string }> {
  const [card] = await db.select().from(s.accounts).where(eq(s.accounts.id, p.cardAccountId));
  if (!card || card.kind !== "tarjeta") return { ok: false, error: "Esa cuenta no es una tarjeta." };
  const [from] = await db.select().from(s.accounts).where(eq(s.accounts.id, p.fromAccountId));
  if (!from || from.kind === "tarjeta" || from.archived) return { ok: false, error: "Elegí de qué cuenta sale la plata." };
  if (from.currency !== card.currency) return { ok: false, error: "La cuenta y la tarjeta tienen que estar en la misma moneda." };
  const items = await listStatementInstallments(db, p.cardAccountId, p.dueDate);
  if (items.length === 0) return { ok: false, error: "No hay cuotas impagas con ese vencimiento." };
  const [tr] = await db
    .insert(s.transfers)
    .values({ date: p.date, fromAccountId: p.fromAccountId, toAccountId: p.cardAccountId, amountCents: p.amountCents, note: `Pago resumen ${card.name} (vence ${p.dueDate.split("-").reverse().join("/")})` })
    .returning();
  await db.update(s.installments).set({ paid: true, paidTransferId: tr.id }).where(inArray(s.installments.id, items.map((i) => i.id)));
  return { ok: true, transferId: tr.id, installments: items.length };
}

/** Edita un movimiento. Si era en cuotas y cambió el monto o la fecha, rehace las cuotas. */
export async function updateTransaction(db: Db, id: string, patch: TransactionPatch) {
  const [row] = await db.update(s.transactions).set({ ...patch, updatedAt: new Date() }).where(eq(s.transactions.id, id)).returning();
  if (!row) return null;
  if (row.billId && patch.amountCents) await db.update(s.bills).set({ amountCents: patch.amountCents, updatedAt: new Date() }).where(eq(s.bills.id, row.billId));
  if (!row.isIncome && (patch.amountCents || patch.date || patch.accountId !== undefined)) await writeInstallments(db, row);
  return row;
}

/** Borra un movimiento (y sus cuotas). Si era el pago de una boleta, la boleta vuelve a pendiente. */
export async function deleteTransaction(db: Db, id: string) {
  const [row] = await db.delete(s.transactions).where(eq(s.transactions.id, id)).returning();
  if (row?.billId) await db.update(s.bills).set({ status: "pending", paidAt: null, updatedAt: new Date() }).where(eq(s.bills.id, row.billId));
  return row ?? null;
}

/** Sueldos cobrados (los ingresos marcados como sueldo), del más nuevo al más viejo. */
export async function listSalaryHistory(db: Db, limit = 24) {
  return db
    .select({
      id: s.transactions.id,
      period: s.transactions.salaryPeriod,
      date: s.transactions.date,
      amountCents: s.transactions.amountCents,
      accountName: s.accounts.name,
    })
    .from(s.transactions)
    .leftJoin(s.accounts, eq(s.transactions.accountId, s.accounts.id))
    .where(sql`${s.transactions.salaryPeriod} is not null`)
    .orderBy(desc(s.transactions.salaryPeriod), desc(s.transactions.date))
    .limit(limit);
}

export async function setReimbursed(db: Db, id: string, reimbursedCents: number) {
  const [row] = await db.update(s.transactions).set({ reimbursedCents, updatedAt: new Date() }).where(eq(s.transactions.id, id)).returning();
  return row ?? null;
}

// ─── Objetivos ──────────────────────────────────────────────────────────────
export async function listGoals(db: Db) {
  const goals = await db.select().from(s.goals).where(eq(s.goals.archived, false)).orderBy(asc(s.goals.createdAt));
  const sums = await db
    .select({ goalId: s.goalContributions.goalId, total: sql<string>`sum(${s.goalContributions.amountCents})` })
    .from(s.goalContributions)
    .groupBy(s.goalContributions.goalId);
  const byGoal = new Map(sums.map((r) => [r.goalId, Number(r.total)]));
  return goals.map((g) => ({ ...g, savedCents: byGoal.get(g.id) ?? 0 }));
}

export async function createGoal(db: Db, g: { name: string; targetCents: number; targetDate?: ISODate | null; monthlyContributionCents?: number | null; currency?: "ARS" | "USD" }) {
  const [row] = await db.insert(s.goals).values(g).returning();
  return row;
}

export async function updateGoal(
  db: Db,
  id: string,
  patch: { name?: string; targetCents?: number; targetDate?: ISODate | null; monthlyContributionCents?: number | null; archived?: boolean; currency?: "ARS" | "USD" },
) {
  const [row] = await db.update(s.goals).set({ ...patch, updatedAt: new Date() }).where(eq(s.goals.id, id)).returning();
  return row ?? null;
}

export async function addGoalContribution(db: Db, goalId: string, date: ISODate, amountCents: number) {
  const [row] = await db.insert(s.goalContributions).values({ goalId, date, amountCents }).returning();
  return row;
}

// ─── Cotizaciones ───────────────────────────────────────────────────────────
export async function saveQuotes(db: Db, quotes: { house: string; buyCents: number | null; sellCents: number | null; quotedAt: Date }[]) {
  if (quotes.length === 0) return;
  await db.insert(s.marketQuotes).values(quotes);
}

export async function quoteHistory(db: Db, house: string, since: Date) {
  return db
    .select({ sellCents: s.marketQuotes.sellCents, fetchedAt: s.marketQuotes.fetchedAt })
    .from(s.marketQuotes)
    .where(and(eq(s.marketQuotes.house, house), gte(s.marketQuotes.fetchedAt, since)))
    .orderBy(asc(s.marketQuotes.fetchedAt));
}

// ─── Documentos originales ──────────────────────────────────────────────────
export async function createDocument(
  db: Db,
  d: { kind: "bill" | "payslip"; mimeType: string; fileName: string | null; data: Uint8Array },
) {
  const [row] = await db
    .insert(s.documents)
    .values({
      kind: d.kind,
      mimeType: d.mimeType,
      fileName: d.fileName,
      sizeBytes: d.data.byteLength,
      contentBase64: Buffer.from(d.data).toString("base64"),
    })
    .returning({ id: s.documents.id });
  return row.id;
}

export async function updateDocument(
  db: Db,
  id: string,
  patch: { status?: "parsed" | "confirmed" | "failed"; extractedJson?: unknown; error?: string | null; method?: string },
) {
  await db.update(s.documents).set({ ...patch, updatedAt: new Date() }).where(eq(s.documents.id, id));
}

export async function getDocumentFile(db: Db, id: string) {
  const [row] = await db
    .select({ mimeType: s.documents.mimeType, fileName: s.documents.fileName, contentBase64: s.documents.contentBase64 })
    .from(s.documents)
    .where(eq(s.documents.id, id));
  if (!row?.contentBase64) return null;
  return { mimeType: row.mimeType ?? "application/octet-stream", fileName: row.fileName, data: Buffer.from(row.contentBase64, "base64") };
}

/** Borra un documento que no llegó a confirmarse (no toca boletas ni recibos ya guardados). */
export async function deleteUnconfirmedDocument(db: Db, id: string) {
  const [bill] = await db.select({ id: s.bills.id }).from(s.bills).where(eq(s.bills.sourceDocumentId, id)).limit(1);
  const [slip] = await db.select({ id: s.payslips.id }).from(s.payslips).where(eq(s.payslips.sourceDocumentId, id)).limit(1);
  if (bill || slip) return false;
  await db.delete(s.documents).where(eq(s.documents.id, id));
  return true;
}

// ─── Cuentas ────────────────────────────────────────────────────────────────
export type AccountKind = (typeof s.accountKindEnum.enumValues)[number];

export interface AccountView {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalanceCents: number;
  balanceSetAt: string;
  /** Saldo actual: saldo fijado + ingresos − gastos cargados después. En tarjetas, negativo = deuda. */
  balanceCents: number;
  currency: "ARS" | "USD";
  closingDay: number | null;
  dueDay: number | null;
}

export async function listAccounts(db: Db): Promise<AccountView[]> {
  const rows = await db.select().from(s.accounts).where(eq(s.accounts.archived, false)).orderBy(asc(s.accounts.createdAt));
  if (rows.length === 0) return [];
  const moves = await db
    .select({
      accountId: s.transactions.accountId,
      // Ingresos suman; gastos restan; lo que te devolvieron vuelve a la cuenta.
      delta: sql<string>`coalesce(sum(case when ${s.transactions.isIncome} then ${s.transactions.amountCents} else ${s.transactions.reimbursedCents} - ${s.transactions.amountCents} end), 0)`,
    })
    .from(s.transactions)
    .innerJoin(s.accounts, eq(s.transactions.accountId, s.accounts.id))
    .where(sql`${s.transactions.createdAt} > ${s.accounts.balanceSetAt}`)
    .groupBy(s.transactions.accountId);
  const delta = new Map(moves.map((m) => [m.accountId, Number(m.delta)]));
  // Transferencias: salen de una cuenta y entran en otra (cuentan las cargadas después de fijar el saldo).
  const outs = await db
    .select({ accountId: s.transfers.fromAccountId, total: sql<string>`coalesce(sum(${s.transfers.amountCents}), 0)` })
    .from(s.transfers)
    .innerJoin(s.accounts, eq(s.transfers.fromAccountId, s.accounts.id))
    .where(sql`${s.transfers.createdAt} > ${s.accounts.balanceSetAt}`)
    .groupBy(s.transfers.fromAccountId);
  const ins = await db
    .select({ accountId: s.transfers.toAccountId, total: sql<string>`coalesce(sum(coalesce(${s.transfers.toAmountCents}, ${s.transfers.amountCents})), 0)` })
    .from(s.transfers)
    .innerJoin(s.accounts, eq(s.transfers.toAccountId, s.accounts.id))
    .where(sql`${s.transfers.createdAt} > ${s.accounts.balanceSetAt}`)
    .groupBy(s.transfers.toAccountId);
  for (const o of outs) delta.set(o.accountId, (delta.get(o.accountId) ?? 0) - Number(o.total));
  for (const i of ins) delta.set(i.accountId, (delta.get(i.accountId) ?? 0) + Number(i.total));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    openingBalanceCents: r.openingBalanceCents,
    balanceSetAt: r.balanceSetAt.toISOString(),
    balanceCents: r.openingBalanceCents + (delta.get(r.id) ?? 0),
    currency: r.currency,
    closingDay: r.closingDay,
    dueDay: r.dueDay,
  }));
}

export async function createAccount(db: Db, a: { name: string; kind: AccountKind; balanceCents: number; currency?: "ARS" | "USD" }) {
  const [row] = await db
    .insert(s.accounts)
    .values({ name: a.name, kind: a.kind, currency: a.currency ?? "ARS", openingBalanceCents: a.balanceCents, balanceSetAt: new Date() })
    .returning();
  return row;
}

/** Fija el saldo actual (lo que ves en el banco hoy). Los movimientos anteriores dejan de contar. */
export async function setAccountBalance(db: Db, id: string, balanceCents: number) {
  const now = new Date();
  const [row] = await db
    .update(s.accounts)
    .set({ openingBalanceCents: balanceCents, balanceSetAt: now, updatedAt: now })
    .where(eq(s.accounts.id, id))
    .returning();
  return row ?? null;
}

export async function updateAccount(db: Db, id: string, patch: { name?: string; archived?: boolean; closingDay?: number | null; dueDay?: number | null }) {
  const [row] = await db.update(s.accounts).set({ ...patch, updatedAt: new Date() }).where(eq(s.accounts.id, id)).returning();
  return row ?? null;
}

// ─── Transferencias ─────────────────────────────────────────────────────────
export async function createTransfer(db: Db, t: TransferInput) {
  const [row] = await db.insert(s.transfers).values(t).returning();
  return row;
}

export async function updateTransfer(db: Db, id: string, t: TransferInput) {
  const [row] = await db.update(s.transfers).set({ ...t, updatedAt: new Date() }).where(eq(s.transfers.id, id)).returning();
  return row ?? null;
}

export async function deleteTransfer(db: Db, id: string) {
  // Si era el pago de un resumen, sus cuotas vuelven a quedar impagas.
  await db.update(s.installments).set({ paid: false, paidTransferId: null }).where(eq(s.installments.paidTransferId, id));
  const [row] = await db.delete(s.transfers).where(eq(s.transfers.id, id)).returning({ id: s.transfers.id });
  return row ?? null;
}

export async function listTransfers(db: Db, month: YearMonth) {
  return db
    .select()
    .from(s.transfers)
    .where(and(gte(s.transfers.date, `${month}-01`), lte(s.transfers.date, lastDayOfMonth(month))))
    .orderBy(desc(s.transfers.date), desc(s.transfers.createdAt));
}

// ─── Avisos push ────────────────────────────────────────────────────────────
export async function savePushSubscription(db: Db, sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }) {
  await db
    .insert(s.pushSubscriptions)
    .values(sub)
    .onConflictDoUpdate({ target: s.pushSubscriptions.endpoint, set: { p256dh: sub.p256dh, auth: sub.auth, updatedAt: new Date() } });
}

export async function deletePushSubscription(db: Db, endpoint: string) {
  await db.delete(s.pushSubscriptions).where(eq(s.pushSubscriptions.endpoint, endpoint));
}

export async function listPushSubscriptions(db: Db) {
  return db.select().from(s.pushSubscriptions);
}
