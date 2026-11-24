import type { BillProvider, ISODate, YearMonth } from "@/types/finance";
import type { ScaleEntry } from "@/lib/finance/commerce-union";
import type { RentContract, IndexData } from "@/lib/finance/rent-adjustment";
import type { CashflowInput } from "@/lib/finance/cashflow";
import type { DueItem } from "@/lib/finance/deadlines";
import { PROVIDER_NAME } from "@/lib/labels";
import { addMonths, monthOf, toISODate, parseYearMonth, daysInMonth, addMonthsToDate, monthRange } from "@/lib/finance/dates";

/**
 * DATOS DE EJEMPLO para ver la app funcionando antes de conectar la base.
 * Todos los montos y escalas son ficticios (no son valores oficiales).
 * Se generan relativos a la fecha de hoy para que el tablero se vea "vivo".
 */

export const DEMO_SETTINGS = {
  monthlyInflation: 0.025,
  monthlyAlternativeRate: 0.022,
  bufferCents: 5_000_000,
};

/** Escala ficticia de ejemplo. Reemplazar por la escala vigente en Sueldo y Alquiler. */
export function demoScales(today: ISODate): ScaleEntry[] {
  const y = Number(today.slice(0, 4));
  return [
    { category: "AUXILIAR_C", validFrom: `${y - 1}-01-01`, validTo: `${y}-03-31`, basicCents: 95_000_000, nonRemunerativeCents: 4_000_000, source: "Ejemplo" },
    { category: "AUXILIAR_C", validFrom: `${y}-04-01`, validTo: null, basicCents: 105_000_000, nonRemunerativeCents: 4_000_000, source: "Ejemplo — cargar escala real" },
    { category: "AUXILIAR_B", validFrom: `${y}-04-01`, validTo: null, basicCents: 103_000_000, nonRemunerativeCents: 4_000_000, source: "Ejemplo" },
    { category: "VENDEDOR_B", validFrom: `${y}-04-01`, validTo: null, basicCents: 104_000_000, nonRemunerativeCents: 4_000_000, source: "Ejemplo" },
  ];
}

export function demoRentContract(today: ISODate): RentContract {
  return {
    startDate: addMonthsToDate(`${monthOf(today)}-01`, -5),
    baseRentCents: 28_000_000,
    adjustmentIntervalMonths: 3,
    indexType: "IPC",
    durationMonths: 36,
    lagMonths: 1,
  };
}

/** IPC ficticio: 2,5 % mensual para los últimos 12 meses. */
export function demoIndices(today: ISODate): IndexData {
  const m = monthOf(today);
  return { ipc: monthRange(addMonths(m, -12), 12).map((month, i) => ({ month, rate: 0.022 + (i % 3) * 0.003 })) };
}

const day = (ym: YearMonth, d: number) => {
  const { y, m } = parseYearMonth(ym);
  return toISODate(y, m, Math.min(d, daysInMonth(ym)));
};

export interface DemoBill {
  id: string;
  provider: BillProvider;
  period: YearMonth;
  dueDate: ISODate;
  amountCents: number;
  paid: boolean;
}

export function demoBills(today: ISODate): DemoBill[] {
  const m = monthOf(today);
  const todayDay = Number(today.slice(8));
  const due = (d: number) => day(m, d);
  return [
    { id: "b1", provider: "EDES", period: addMonths(m, -1), dueDate: due(todayDay + 2), amountCents: 3_850_000, paid: false },
    { id: "b2", provider: "CAMUZZI", period: addMonths(m, -1), dueDate: due(todayDay + 5), amountCents: 5_920_000, paid: false },
    { id: "b3", provider: "BVC", period: addMonths(m, -1), dueDate: due(Math.max(1, todayDay - 3)), amountCents: 1_640_000, paid: true },
    { id: "b4", provider: "PERSONAL", period: m, dueDate: due(todayDay), amountCents: 2_499_000, paid: false },
  ];
}

/** Historial de gas para mostrar la detección de anomalías. */
export function demoGasHistory(today: ISODate) {
  const m = monthOf(today);
  return monthRange(addMonths(m, -7), 6).map((period, i) => ({ period, amountCents: 3_600_000 + i * 90_000 }));
}

export interface DemoTransaction {
  id: string;
  date: ISODate;
  description: string;
  category: string;
  amountCents: number;
  paymentMethod: "contado" | "debito" | "tarjeta" | "cuotas" | "transferencia";
  installments?: number;
  owedByName?: string;
  owedCents?: number;
}

export function demoTransactions(today: ISODate): DemoTransaction[] {
  const m = monthOf(today);
  const d = (n: number) => day(m, n);
  return [
    { id: "t1", date: d(2), description: "Supermercado", category: "Comida", amountCents: 8_540_000, paymentMethod: "debito" },
    { id: "t2", date: d(4), description: "Nafta", category: "Traslados", amountCents: 3_500_000, paymentMethod: "tarjeta" },
    { id: "t3", date: d(6), description: "Zapatillas", category: "Ropa", amountCents: 12_000_000, paymentMethod: "cuotas", installments: 6 },
    { id: "t4", date: d(9), description: "Cena con amigos", category: "Salidas", amountCents: 4_800_000, paymentMethod: "debito", owedByName: "Juan", owedCents: 1_600_000 },
    { id: "t5", date: d(12), description: "Verdulería", category: "Comida", amountCents: 1_230_000, paymentMethod: "contado" },
    { id: "t6", date: d(15), description: "Farmacia", category: "Salud", amountCents: 2_150_000, paymentMethod: "debito" },
    { id: "t7", date: d(18), description: "Supermercado", category: "Comida", amountCents: 7_980_000, paymentMethod: "debito" },
  ].filter((t) => t.date <= today) as DemoTransaction[];
}

export function demoGoals() {
  return [
    { id: "g1", name: "Fondo de emergencia", targetCents: 300_000_000, savedCents: 120_000_000, monthlyContributionCents: 10_000_000 },
    { id: "g2", name: "Vacaciones", targetCents: 150_000_000, savedCents: 35_000_000, monthlyContributionCents: 5_000_000 },
  ];
}

/** Cuotas vigentes (para el mes actual y el cashflow). */
export function demoInstallmentPlans(today: ISODate) {
  const m = monthOf(today);
  return [
    { label: "Zapatillas", firstMonth: addMonths(m, 1), count: 6, installmentCents: 2_000_000 },
    { label: "Heladera", firstMonth: addMonths(m, -3), count: 12, installmentCents: 6_500_000 },
  ];
}

export const DEMO_NET_INCOME_CENTS = 110_000_000;

export function demoDueItems(today: ISODate, rentCents: number): DueItem[] {
  const m = monthOf(today);
  return [
    ...demoBills(today).map((b) => ({ id: b.id, label: PROVIDER_NAME[b.provider], amountCents: b.amountCents, dueDate: b.dueDate, paid: b.paid, kind: "bill" as const })),
    { id: "rent", label: "Alquiler", amountCents: rentCents, dueDate: day(m, 10), paid: Number(today.slice(8)) > 10, kind: "rent" },
    { id: "card", label: "Resumen tarjeta", amountCents: 6_500_000 + 3_500_000, dueDate: day(m, 28), paid: false, kind: "card" },
  ];
}

export function demoCashflowInput(today: ISODate, rentByMonth: Map<YearMonth, number>): CashflowInput {
  const m = monthOf(today);
  const goals = demoGoals();
  return {
    startMonth: m,
    months: 6,
    openingBalanceCents: 18_000_000,
    minBalanceCents: 5_000_000,
    recurring: [
      { kind: "income", direction: "in", label: "Sueldo", amountCents: DEMO_NET_INCOME_CENTS, fromMonth: m, monthlyGrowth: 0.018 },
      { kind: "bill", direction: "out", label: "Servicios", amountCents: 13_900_000, fromMonth: m, monthlyGrowth: DEMO_SETTINGS.monthlyInflation, indexed: true },
      { kind: "expense", direction: "out", label: "Gastos variables", amountCents: 33_000_000, fromMonth: m, monthlyGrowth: DEMO_SETTINGS.monthlyInflation, indexed: true },
      ...goals.map((g) => ({ kind: "goal" as const, direction: "out" as const, label: g.name, amountCents: g.monthlyContributionCents, fromMonth: m })),
    ],
    installmentPlans: demoInstallmentPlans(today),
    oneOff: [
      ...[...rentByMonth.entries()].map(([month, amountCents]) => ({ month, kind: "rent" as const, direction: "out" as const, label: "Alquiler", amountCents })),
      // Aguinaldo en junio y diciembre (estimado: medio sueldo).
      ...monthRange(m, 6)
        .filter((x) => x.endsWith("-06") || x.endsWith("-12"))
        .map((month) => ({ month, kind: "income" as const, direction: "in" as const, label: "Aguinaldo (SAC)", amountCents: DEMO_NET_INCOME_CENTS / 2 })),
    ],
  };
}
