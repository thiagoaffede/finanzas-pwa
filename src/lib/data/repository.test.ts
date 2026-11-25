import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import type { Db } from "./db-type";
import * as repo from "./repository";
import { loadFromDb } from "./context";
import { buildDashboard } from "@/lib/dashboard";

/** Base Postgres en memoria con las mismas migraciones que Neon. */
async function freshDb(): Promise<Db> {
  const client = new PGlite();
  const dir = path.resolve(import.meta.dirname, "../../../drizzle");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(path.join(dir, file), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await client.exec(stmt);
    }
  }
  return drizzle(client, { schema }) as unknown as Db;
}

const TODAY = "2026-11-24";

describe("repositorio (PGlite)", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
  }, 30_000);

  it("ajustes: defaults y guardado parcial", async () => {
    expect(await repo.getSettings(db)).toEqual(repo.DEFAULT_SETTINGS);
    await repo.saveSettings(db, { monthlyInflation: 0.03, openingBalanceCents: 50_000_00 });
    const s = await repo.getSettings(db);
    expect(s.monthlyInflation).toBeCloseTo(0.03);
    expect(s.openingBalanceCents).toBe(50_000_00);
    expect(s.netIncomeCents).toBeNull();
  });

  it("gasto en cuotas: crea las cuotas y no duplica con el mismo clientId", async () => {
    const tx = {
      date: "2026-11-10",
      amountCents: 120_000_00,
      isIncome: false,
      paymentMethod: "cuotas" as const,
      installmentsCount: 3,
      description: "Heladera",
      category: "Hogar",
      owedCents: 0,
      clientId: "abc-1",
    };
    expect(await repo.createTransaction(db, tx)).not.toBeNull();
    expect(await repo.createTransaction(db, tx)).toBeNull();
    const inst = await repo.listInstallments(db, "2026-11-01");
    expect(inst.map((i) => i.dueDate)).toEqual(["2026-12-10", "2027-01-10", "2027-02-10"]);
    expect(inst.reduce((s, i) => s + i.amountCents, 0)).toBe(120_000_00);
    expect(inst[0].label).toBe("Heladera");
  });

  it("boletas: alta y marcar pagada", async () => {
    const b = await repo.createBill(db, { provider: "EDES", billingPeriod: "2026-11", dueDate: "2026-11-28", amountCents: 45_000_00, status: "pending" });
    await repo.setBillPaid(db, b.id, true, TODAY);
    const [row] = await repo.listBills(db, { from: "2026-11-01" });
    expect(row.status).toBe("paid");
    expect(row.paidAt).toBe(TODAY);
    // El pago queda como movimiento ligado a la boleta.
    const tx = (await repo.listTransactions(db, { month: "2026-11" })).find((t) => t.billId === b.id);
    expect(tx?.amountCents).toBe(45_000_00);
  });

  it("gasto fijo: pagarlo desde una cuenta crea el del mes siguiente y descuenta el saldo", async () => {
    const acc = await repo.createAccount(db, { name: "Banco", kind: "banco", balanceCents: 100_000_00 });
    const gym = await repo.createBill(db, { provider: "OTRO", providerLabel: "Gimnasio", billingPeriod: "2026-11", dueDate: "2026-11-10", amountCents: 30_000_00, status: "pending", recurring: true });
    await repo.setBillPaid(db, gym.id, true, TODAY, { accountId: acc.id, amountCents: 32_000_00 });
    const bills = await repo.listBills(db, { from: "2026-11-01" });
    const next = bills.find((b) => b.providerLabel === "Gimnasio" && b.billingPeriod === "2026-12");
    expect(next).toMatchObject({ dueDate: "2026-12-10", amountCents: 32_000_00, status: "pending", recurring: true });
    expect((await repo.listAccounts(db)).find((a) => a.id === acc.id)?.balanceCents).toBe(68_000_00);
    // Pagarlo dos veces no duplica el del mes siguiente; desmarcarlo devuelve la plata.
    await repo.setBillPaid(db, gym.id, true, TODAY, { accountId: acc.id });
    expect((await repo.listBills(db, { from: "2026-12-01" })).filter((b) => b.providerLabel === "Gimnasio")).toHaveLength(1);
    await repo.setBillPaid(db, gym.id, false, TODAY);
    expect((await repo.listAccounts(db)).find((a) => a.id === acc.id)?.balanceCents).toBe(100_000_00);
    await repo.deleteBill(db, next!.id);
    await repo.deleteBill(db, gym.id);
    await repo.updateAccount(db, acc.id, { archived: true });
  });

  it("transferencias: mueven saldo entre cuentas sin ser gasto ni ingreso", async () => {
    const banco = await repo.createAccount(db, { name: "Banco T", kind: "banco", balanceCents: 100_000_00 });
    const mp = await repo.createAccount(db, { name: "Billetera T", kind: "billetera", balanceCents: 10_000_00 });
    const t = await repo.createTransfer(db, { date: TODAY, fromAccountId: banco.id, toAccountId: mp.id, amountCents: 30_000_00 });
    const bal = async () => Object.fromEntries((await repo.listAccounts(db)).map((a) => [a.id, a.balanceCents]));
    expect((await bal())[banco.id]).toBe(70_000_00);
    expect((await bal())[mp.id]).toBe(40_000_00);
    await repo.updateTransfer(db, t.id, { date: TODAY, fromAccountId: mp.id, toAccountId: banco.id, amountCents: 5_000_00 });
    expect((await bal())[banco.id]).toBe(105_000_00);
    expect((await repo.listTransfers(db, "2026-11")).map((x) => x.id)).toEqual([t.id]);
    await repo.deleteTransfer(db, t.id);
    expect((await bal())[mp.id]).toBe(10_000_00);
    await repo.updateAccount(db, banco.id, { archived: true });
    await repo.updateAccount(db, mp.id, { archived: true });
  });

  it("tarjeta: cuotas según el cierre, y el pago único también se proyecta", async () => {
    const visa = await repo.createAccount(db, { name: "Visa T", kind: "tarjeta", balanceCents: 0 });
    await repo.updateAccount(db, visa.id, { closingDay: 20, dueDay: 5 });
    const base = { isIncome: false, installmentsCount: 1, owedCents: 0, accountId: visa.id };
    const uno = await repo.createTransaction(db, { ...base, date: "2026-11-24", amountCents: 9_000_00, paymentMethod: "tarjeta", description: "Libro" });
    const cuotas = await repo.createTransaction(db, { ...base, date: "2026-11-10", amountCents: 30_000_00, paymentMethod: "cuotas", installmentsCount: 3, description: "Zapatillas" });
    const rows = await repo.listCardPurchases(db, "2026-11-01");
    expect(rows.filter((r) => r.transactionId === uno!.id).map((r) => r.dueDate)).toEqual(["2027-01-05"]);
    expect(rows.filter((r) => r.transactionId === cuotas!.id).map((r) => r.dueDate)).toEqual(["2026-12-05", "2027-01-05", "2027-02-05"]);
    await repo.deleteTransaction(db, uno!.id);
    await repo.deleteTransaction(db, cuotas!.id);
    await repo.updateAccount(db, visa.id, { archived: true });
  });

  it("gasto fijo trimestral: el próximo se crea 3 meses después con su categoría", async () => {
    const seg = await repo.createBill(db, { provider: "OTRO", providerLabel: "Seguro", billingPeriod: "2026-11", dueDate: "2026-11-15", amountCents: 60_000_00, status: "pending", recurring: true, recurrenceMonths: 3, category: "Hogar" });
    await repo.setBillPaid(db, seg.id, true, TODAY);
    const next = (await repo.listBills(db, { from: "2027-01-01" })).find((b) => b.providerLabel === "Seguro");
    expect(next).toMatchObject({ billingPeriod: "2027-02", dueDate: "2027-02-15", recurrenceMonths: 3, category: "Hogar" });
    const pago = (await repo.listTransactions(db, { month: "2026-11" })).find((t) => t.billId === seg.id);
    expect(pago?.category).toBe("Hogar");
    await repo.deleteBill(db, next!.id);
    await repo.deleteBill(db, seg.id);
  });

  it("movimientos: editar y borrar", async () => {
    const t = await repo.createTransaction(db, { date: TODAY, amountCents: 5_000_00, isIncome: false, paymentMethod: "debito", installmentsCount: 1, owedCents: 0, description: "Café" });
    await repo.updateTransaction(db, t!.id, { amountCents: 6_000_00, description: "Café y medialunas" });
    let row = (await repo.listTransactions(db, { month: "2026-11" })).find((x) => x.id === t!.id);
    expect(row).toMatchObject({ amountCents: 6_000_00, description: "Café y medialunas" });
    await repo.deleteTransaction(db, t!.id);
    row = (await repo.listTransactions(db, { month: "2026-11" })).find((x) => x.id === t!.id);
    expect(row).toBeUndefined();
  });

  it("índices: IPC por mes e ICL por día, con upsert", async () => {
    await repo.upsertIndexValues(db, "IPC", [{ date: "2026-10-01", value: 0.02 }]);
    await repo.upsertIndexValues(db, "IPC", [{ date: "2026-10-15", value: 0.025 }]);
    await repo.upsertIndexValues(db, "ICL", [{ date: "2026-11-01", value: 24.5 }]);
    const idx = await repo.getIndices(db);
    expect(idx.ipc).toEqual([{ month: "2026-10", rate: 0.025 }]);
    expect(idx.icl).toEqual([{ date: "2026-11-01", value: 24.5 }]);
  });

  it("escalas y perfil: upsert por categoría y vigencia", async () => {
    await repo.upsertScale(db, { category: "AUXILIAR_C", validFrom: "2026-10-01", validTo: null, basicCents: 1_100_000_00, nonRemunerativeCents: 40_000_00 });
    await repo.upsertScale(db, { category: "AUXILIAR_C", validFrom: "2026-10-01", validTo: null, basicCents: 1_150_000_00, nonRemunerativeCents: 40_000_00 });
    const scales = await repo.listScales(db);
    expect(scales).toHaveLength(1);
    expect(scales[0].basicCents).toBe(1_150_000_00);
    await repo.savePayrollProfile(db, { category: "AUXILIAR_C", hireDate: "2022-03-01", weeklyHours: 48, configOverrides: null });
    expect((await repo.getPayrollProfile(db))?.hireDate).toBe("2022-03-01");
  });

  it("objetivos: suma de aportes", async () => {
    const g = await repo.createGoal(db, { name: "Vacaciones", targetCents: 1_000_000_00, monthlyContributionCents: 100_000_00 });
    await repo.addGoalContribution(db, g.id, TODAY, 150_000_00);
    await repo.addGoalContribution(db, g.id, TODAY, 50_000_00);
    const [goal] = await repo.listGoals(db);
    expect(goal.savedCents).toBe(200_000_00);
  });

  it("alquiler: guarda un contrato activo por vez", async () => {
    const base = { label: "Alquiler", startDate: "2026-03-01", durationMonths: 36, baseRentCents: 500_000_00, adjustmentIntervalMonths: 3, indexType: "IPC" as const, lagMonths: 1 };
    await repo.saveRentContract(db, { ...base, dueDay: 5 });
    await repo.saveRentContract(db, { ...base, baseRentCents: 550_000_00, dueDay: 10 });
    const c = await repo.getActiveRentContract(db);
    expect(c?.baseRentCents).toBe(550_000_00);
    expect(c?.dueDay).toBe(10);
  });

  it("contexto y tablero desde la base", async () => {
    const ctx = await loadFromDb(db, TODAY);
    expect(ctx.demo).toBe(false);
    expect(ctx.netIncomeSource).toBe("estimado");
    expect(ctx.netIncomeCents).toBeGreaterThan(0);
    expect(ctx.transactions).toHaveLength(2); // el gasto en cuotas y el pago de la boleta
    expect(ctx.transactions.filter((t) => !t.billId)).toHaveLength(1);
    expect(ctx.installments[0].label).toBe("Heladera (1/3)");
    expect(ctx.goals[0].savedCents).toBe(200_000_00);

    const d = buildDashboard(ctx);
    expect(d.cashflow.months).toHaveLength(6);
    expect(d.rentNow).toBeGreaterThan(0);
    // Diciembre trae aguinaldo y la primera cuota.
    const dec = d.cashflow.months.find((m) => m.month === "2026-12")!;
    expect(dec.byKind.installment).toBe(40_000_00);
  });

  it("sueldo manual tiene prioridad", async () => {
    await repo.saveSettings(db, { netIncomeCents: 900_000_00 });
    const ctx = await loadFromDb(db, TODAY);
    expect(ctx.netIncomeSource).toBe("manual");
    expect(ctx.netIncomeCents).toBe(900_000_00);
    // Volver a automático (null) no rompe y vuelve al recibo/estimación.
    await repo.saveSettings(db, { ...(await repo.getSettings(db)), netIncomeCents: null });
    expect((await loadFromDb(db, TODAY)).netIncomeSource).toBe("estimado");
  });

  it("cuentas: saldo se mueve con gastos, ingresos y reintegros posteriores", async () => {
    const acc = await repo.createAccount(db, { name: "Banco", kind: "banco", balanceCents: 500_000_00 });
    await repo.createAccount(db, { name: "Visa", kind: "tarjeta", balanceCents: -20_000_00 });
    await new Promise((r) => setTimeout(r, 5));
    const base = { isIncome: false, paymentMethod: "debito" as const, installmentsCount: 1, owedCents: 0, accountId: acc.id };
    const gasto = await repo.createTransaction(db, { ...base, date: TODAY, amountCents: 30_000_00, clientId: "acc-1" });
    await repo.createTransaction(db, { ...base, date: TODAY, amountCents: 100_000_00, isIncome: true, clientId: "acc-2" });
    await repo.setReimbursed(db, gasto!.id, 10_000_00);
    const all = await repo.listAccounts(db);
    const banco = all.find((a) => a.id === acc.id)!;
    const visa = all.find((a) => a.kind === "tarjeta")!;
    expect(banco.balanceCents).toBe(580_000_00);
    expect(visa.balanceCents).toBe(-20_000_00);

    // Ajustar al saldo real: lo anterior deja de contar.
    await repo.setAccountBalance(db, acc.id, 600_000_00);
    const ajustado = (await repo.listAccounts(db)).find((a) => a.id === acc.id)!;
    expect(ajustado.balanceCents).toBe(600_000_00);

    // El flujo de caja arranca del total de cuentas (sin tarjetas).
    const ctx = await loadFromDb(db, TODAY);
    expect(buildDashboard(ctx).cashflow.months[0].openingCents).toBe(600_000_00);
  });

  it("documentos: guarda el original, lo devuelve y se vincula al confirmar", async () => {
    const data = new TextEncoder().encode("%PDF-1.4 prueba");
    const id = await repo.createDocument(db, { kind: "bill", mimeType: "application/pdf", fileName: "luz.pdf", data });
    const file = await repo.getDocumentFile(db, id);
    expect(file?.mimeType).toBe("application/pdf");
    expect(new TextDecoder().decode(file!.data)).toBe("%PDF-1.4 prueba");

    await repo.createBill(db, { provider: "CAMUZZI", billingPeriod: "2026-11", dueDate: "2026-11-30", amountCents: 1_000_00, status: "pending", sourceDocumentId: id });
    expect(await repo.deleteUnconfirmedDocument(db, id)).toBe(false);
    const ctx = await loadFromDb(db, TODAY);
    expect(ctx.bills.find((b) => b.provider === "CAMUZZI")?.documentId).toBe(id);

    const orphan = await repo.createDocument(db, { kind: "bill", mimeType: "image/jpeg", fileName: null, data });
    expect(await repo.deleteUnconfirmedDocument(db, orphan)).toBe(true);
    expect(await repo.getDocumentFile(db, orphan)).toBeNull();
  });

  it("suscripciones push: alta idempotente y baja", async () => {
    const sub = { endpoint: "https://push.example/abc", p256dh: "k1", auth: "a1" };
    await repo.savePushSubscription(db, sub);
    await repo.savePushSubscription(db, { ...sub, p256dh: "k2" });
    let subs = await repo.listPushSubscriptions(db);
    expect(subs).toHaveLength(1);
    expect(subs[0].p256dh).toBe("k2");
    await repo.deletePushSubscription(db, sub.endpoint);
    subs = await repo.listPushSubscriptions(db);
    expect(subs).toHaveLength(0);
  });
});
