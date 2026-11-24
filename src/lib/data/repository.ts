import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import type { Db } from "./db-type";
import type { BillProvider, ISODate, Rate, YearMonth } from "@/types/finance";
import type { CommerceCategory, CommerceUnionConfig, PayLine, ScaleEntry } from "@/lib/finance/commerce-union";
import type { IndexData, RentContract } from "@/lib/finance/rent-adjustment";
import type { BillInput, TransactionInput } from "@/lib/schemas";
import { addMonthsToDate, lastDayOfMonth } from "@/lib/finance/dates";
import { splitCents } from "@/lib/finance/money";

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
}

export const DEFAULT_SETTINGS: AppSettings = {
  monthlyInflation: 0.025,
  monthlyAlternativeRate: 0.022,
  bufferCents: 0,
  netIncomeCents: null,
  openingBalanceCents: 0,
  minBalanceCents: 0,
  paydayBusinessDay: 3,
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
    source: e.source ?? null,
  };
  const [row] = await db
    .insert(s.payrollScales)
    .values(values)
    .onConflictDoUpdate({ target: [s.payrollScales.agreement, s.payrollScales.category, s.payrollScales.validFrom], set: values })
    .returning();
  return row;
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
  for (const p of points) {
    const date = indexType === "IPC" ? `${p.date.slice(0, 7)}-01` : p.date;
    await db
      .insert(s.indexValues)
      .values({ indexType, date, value: String(p.value), source: source ?? null })
      .onConflictDoUpdate({ target: [s.indexValues.indexType, s.indexValues.date], set: { value: String(p.value), source: source ?? null } });
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

export async function createBill(db: Db, b: BillInput & { rawExtractedJson?: unknown; sourceDocumentId?: string | null }) {
  const [row] = await db.insert(s.bills).values(b).returning();
  if (b.sourceDocumentId) await updateDocument(db, b.sourceDocumentId, { status: "confirmed" });
  return row;
}

export async function setBillPaid(db: Db, id: string, paid: boolean, paidAt: ISODate | null) {
  const [row] = await db
    .update(s.bills)
    .set({ status: paid ? "paid" : "pending", paidAt: paid ? paidAt : null, updatedAt: new Date() })
    .where(eq(s.bills.id, id))
    .returning();
  return row ?? null;
}

// ─── Movimientos y cuotas ───────────────────────────────────────────────────
export async function createTransaction(db: Db, tx: TransactionInput) {
  const installmentsCount = tx.paymentMethod === "cuotas" ? tx.installmentsCount : 1;
  const [created] = await db
    .insert(s.transactions)
    .values({ ...tx, installmentsCount })
    .onConflictDoNothing({ target: s.transactions.clientId })
    .returning();
  if (!created) return null; // ya existía (reintento de la cola offline)

  if (installmentsCount > 1) {
    const amounts = splitCents(tx.amountCents, installmentsCount);
    await db.insert(s.installments).values(
      amounts.map((amountCents, i) => ({
        transactionId: created.id,
        number: i + 1,
        total: installmentsCount,
        dueDate: addMonthsToDate(tx.date, i + 1),
        amountCents,
      })),
    );
  }
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
    .where(gte(s.installments.dueDate, from))
    .orderBy(asc(s.installments.dueDate));
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

export async function createGoal(db: Db, g: { name: string; targetCents: number; targetDate?: ISODate | null; monthlyContributionCents?: number | null }) {
  const [row] = await db.insert(s.goals).values(g).returning();
  return row;
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
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    openingBalanceCents: r.openingBalanceCents,
    balanceSetAt: r.balanceSetAt.toISOString(),
    balanceCents: r.openingBalanceCents + (delta.get(r.id) ?? 0),
  }));
}

export async function createAccount(db: Db, a: { name: string; kind: AccountKind; balanceCents: number }) {
  const [row] = await db.insert(s.accounts).values({ name: a.name, kind: a.kind, openingBalanceCents: a.balanceCents, balanceSetAt: new Date() }).returning();
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

export async function updateAccount(db: Db, id: string, patch: { name?: string; archived?: boolean }) {
  const [row] = await db.update(s.accounts).set({ ...patch, updatedAt: new Date() }).where(eq(s.accounts.id, id)).returning();
  return row ?? null;
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
