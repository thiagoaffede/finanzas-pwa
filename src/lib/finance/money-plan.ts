import type { Cents } from "@/types/finance";

/**
 * Plan de la plata: cómo repartir el sueldo neto (por defecto 55/25/20 entre gastos fijos,
 * gastos libres y ahorro), cuánto va a cada categoría y cómo venís este mes.
 * Lógica pura: los montos llegan ya calculados desde el contexto.
 */

export interface PlanSplit {
  /** Gastos fijos y necesarios (alquiler, servicios, cuotas, súper, traslados…). */
  needs: number;
  /** Gastos libres (salidas, ropa, suscripciones…). */
  wants: number;
  savings: number;
}

export const DEFAULT_SPLIT: PlanSplit = { needs: 0.55, wants: 0.25, savings: 0.2 };

/** Categorías de gastos necesarios y su peso para repartir lo que queda después de los fijos. */
export const NEED_WEIGHTS: Record<string, number> = { Comida: 55, Traslados: 15, Hogar: 10, Salud: 10, Facultad: 10 };
/** Categorías de gastos libres y su peso. */
export const WANT_WEIGHTS: Record<string, number> = { Salidas: 40, Ropa: 20, Suscripciones: 10, Regalos: 10, Deporte: 10, Otros: 10 };
/** Categorías que cuentan como necesarias (las que no están acá son gastos libres). */
export const NEED_CATEGORIES = new Set([...Object.keys(NEED_WEIGHTS), "Servicios", "Educación"]);

/** Mínimo para comida, traslados, salud y casa aunque los fijos se coman el bloque de necesarios. */
export const ESSENTIALS_FLOOR = 0.15;

export const isNeed =(category: string) => NEED_CATEGORIES.has(category);

/** Límites de referencia (fracción del neto). */
export const LIMITS = {
  rent: { ok: 0.3, warn: 0.35 },
  cuotas: { ok: 0.1, warn: 0.15 },
  emergencyMonths: { min: 3, ideal: 6 },
  /** Colchón para imprevistos chicos que conviene dejar en la cuenta del día a día. */
  buffer: 0.1,
} as const;

export type Tone = "good" | "warn" | "bad";

export interface PlanInput {
  netIncomeCents: Cents;
  split?: PlanSplit;
  /** Alquiler del mes. */
  rentCents: Cents;
  /** Servicios y gastos fijos mensuales (la última boleta de cada uno). */
  servicesCents: Cents;
  /** Cuotas de tarjeta que vencen este mes. */
  cuotasCents: Cents;
  /** Gastos del mes por categoría (sin pagos de boletas, cuotas por la del mes). */
  spentByCategory: Record<string, Cents>;
  /** Promedio mensual de gasto variable de los meses anteriores (para proyectar). */
  avgVariableCents: Cents;
  /** Día del mes y días que tiene (para proyectar lo gastado). */
  dayOfMonth: number;
  daysInMonth: number;
  /** Pesos en cuentas del día a día (banco, billetera, efectivo). */
  operatingBalanceCents: Cents;
  /** Pesos apartados: cuentas "reserva" + lo ahorrado en el objetivo de emergencia. */
  emergencySavedCents: Cents;
  hasEmergencyGoal: boolean;
  /** Inflación mensual esperada (fracción). */
  monthlyInflation: number;
  hasBudgets: boolean;
}

export interface PlanBlock {
  key: keyof PlanSplit;
  label: string;
  pct: number;
  plannedCents: Cents;
  /** Lo que ya va del mes en este bloque (en ahorro: lo proyectado). */
  actualCents: Cents;
}

export interface Indicator {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}

export interface Tip {
  key: string;
  tone: Tone;
  title: string;
  text: string;
}

export interface MoneyPlan {
  netIncomeCents: Cents;
  split: PlanSplit;
  blocks: PlanBlock[];
  /** Topes sugeridos por categoría (redondeados a $1.000). */
  suggestedBudgets: Record<string, Cents>;
  fixedCents: Cents;
  /** Cuánto se pasan los fijos del bloque de necesarios (0 si entran). */
  fixedOverflowCents: Cents;
  emergency: { targetCents: Cents; idealCents: Cents; savedCents: Cents; months: number; monthsToTarget: number | null };
  /** Plata de más en la cuenta del día a día y lo que pierde por inflación en un mes. */
  idle: { cents: Cents; monthlyLossCents: Cents };
  projectedSavingsCents: Cents;
  indicators: Indicator[];
  tips: Tip[];
}

const roundK = (c: number) => Math.max(0, Math.round(c / 100_000) * 100_000);
const pct = (x: number) => `${Math.round(x * 100)} %`;
const tone3 = (x: number, ok: number, warn: number): Tone => (x <= ok ? "good" : x <= warn ? "warn" : "bad");

/** Normaliza un reparto para que sume 100 %. */
export function normalizeSplit(s: PlanSplit): PlanSplit {
  const total = s.needs + s.wants + s.savings;
  if (!(total > 0)) return DEFAULT_SPLIT;
  return { needs: s.needs / total, wants: s.wants / total, savings: s.savings / total };
}

function distribute(totalCents: number, weights: Record<string, number>): Record<string, Cents> {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(weights).map(([k, w]) => [k, roundK((totalCents * w) / sum)]));
}

export function buildMoneyPlan(input: PlanInput): MoneyPlan {
  const split = normalizeSplit(input.split ?? DEFAULT_SPLIT);
  const net = Math.max(0, input.netIncomeCents);
  const needs = Math.round(net * split.needs);
  const wants = Math.round(net * split.wants);
  const savings = net - needs - wants;

  // Presupuesto sugerido: a los necesarios se les descuentan los fijos. Para comida, traslados, etc. queda
  // siempre al menos un piso (15 % del neto); lo que falte para eso sale de los gastos libres, no del ahorro.
  const fixed = input.rentCents + input.servicesCents + input.cuotasCents;
  const needsLeft = needs - fixed;
  const overflow = Math.max(0, -needsLeft);
  const needsPool = Math.max(needsLeft, Math.round(net * ESSENTIALS_FLOOR));
  const deficit = Math.max(0, fixed + needsPool - needs);
  const suggestedBudgets = {
    ...distribute(needsPool, NEED_WEIGHTS),
    ...distribute(Math.max(0, wants - deficit), WANT_WEIGHTS),
  };

  // Cómo va el mes: fijos + categorías necesarias / categorías libres; el ahorro se proyecta a fin de mes.
  let needSpent = 0;
  let wantSpent = 0;
  for (const [cat, c] of Object.entries(input.spentByCategory)) {
    if (isNeed(cat)) needSpent += c;
    else wantSpent += c;
  }
  const variableSpent = needSpent + wantSpent;
  const day = Math.max(1, input.dayOfMonth);
  // Proyección del variable: lo gastado a este ritmo, pero nunca menos que el promedio de meses anteriores
  // en la primera semana (a principio de mes el ritmo engaña).
  const pace = Math.round((variableSpent / day) * input.daysInMonth);
  const projectedVariable = day < 8 ? Math.max(variableSpent, input.avgVariableCents, pace) : Math.max(variableSpent, pace);
  const projectedSavings = net - fixed - projectedVariable;

  const blocks: PlanBlock[] = [
    { key: "needs", label: "Gastos fijos y necesarios", pct: split.needs, plannedCents: needs, actualCents: fixed + needSpent },
    { key: "wants", label: "Gastos libres", pct: split.wants, plannedCents: wants, actualCents: wantSpent },
    { key: "savings", label: "Ahorro", pct: split.savings, plannedCents: savings, actualCents: Math.max(0, projectedSavings) },
  ];

  // Fondo de emergencia: 3 meses de gastos necesarios (ideal 6).
  const monthlyEssentials = Math.max(needs, fixed);
  const emergencyTarget = monthlyEssentials * LIMITS.emergencyMonths.min;
  const months = monthlyEssentials > 0 ? input.emergencySavedCents / monthlyEssentials : 0;
  const missing = Math.max(0, emergencyTarget - input.emergencySavedCents);
  const monthsToTarget = missing === 0 ? 0 : savings > 0 ? Math.ceil(missing / savings) : null;

  // Plata quieta: lo que hay en la cuenta del día a día por encima de lo que falta gastar este mes + un colchón.
  // Se toma como pendiente todo lo planeado menos el variable ya gastado (los fijos, como si faltara pagarlos):
  // así nunca se sugiere mover plata que todavía hace falta.
  const remainingThisMonth = Math.max(0, needs + wants - variableSpent, fixed);
  const buffer = Math.round(net * LIMITS.buffer);
  const idle = Math.max(0, input.operatingBalanceCents - remainingThisMonth - buffer);
  const idleLoss = Math.round(idle * input.monthlyInflation);

  const rentPct = net ? input.rentCents / net : 0;
  const cuotasPct = net ? input.cuotasCents / net : 0;
  const savingsRate = net ? projectedSavings / net : 0;
  const indicators: Indicator[] = [];
  if (input.rentCents > 0)
    indicators.push({
      key: "rent",
      label: "Alquiler sobre el sueldo",
      value: pct(rentPct),
      detail: `Ideal hasta ${pct(LIMITS.rent.ok)}, máximo ${pct(LIMITS.rent.warn)}`,
      tone: tone3(rentPct, LIMITS.rent.ok, LIMITS.rent.warn),
    });
  indicators.push({
    key: "cuotas",
    label: "Cuotas de este mes",
    value: pct(cuotasPct),
    detail: `Conviene que no pasen el ${pct(LIMITS.cuotas.ok)} del sueldo`,
    tone: tone3(cuotasPct, LIMITS.cuotas.ok, LIMITS.cuotas.warn),
  });
  indicators.push({
    key: "savings",
    label: "Ahorro proyectado del mes",
    value: pct(Math.max(0, savingsRate)),
    detail: `Meta: ${pct(split.savings)} del sueldo`,
    tone: savingsRate >= split.savings - 0.005 ? "good" : savingsRate >= split.savings / 2 ? "warn" : "bad",
  });
  indicators.push({
    key: "emergency",
    label: "Fondo de emergencia",
    value: `${months.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ${months >= 0.95 && months < 1.05 ? "mes" : "meses"}`,
    detail: `Meta: ${LIMITS.emergencyMonths.min} meses de gastos necesarios`,
    tone: months >= LIMITS.emergencyMonths.min ? "good" : months >= 1 ? "warn" : "bad",
  });

  const ars = (c: number) => `$${Math.round(c / 100).toLocaleString("es-AR")}`;
  const tips: Tip[] = [];
  if (overflow > 0)
    tips.push({
      key: "fixed-over",
      tone: "bad",
      title: "Tus gastos fijos pasan el bloque de necesarios",
      text: `Alquiler, servicios y cuotas suman ${ars(fixed)}, ${ars(overflow)} más de lo planeado. El presupuesto sugerido lo compensa con menos gastos libres para no tocar el ahorro.`,
    });
  if (rentPct > LIMITS.rent.warn)
    tips.push({
      key: "rent",
      tone: "bad",
      title: "El alquiler se lleva mucho del sueldo",
      text: `Es el ${pct(rentPct)} de tu neto. Hasta el próximo aumento de sueldo, compensalo con menos gastos libres.`,
    });
  if (cuotasPct > LIMITS.cuotas.ok)
    tips.push({
      key: "cuotas",
      tone: cuotasPct > LIMITS.cuotas.warn ? "bad" : "warn",
      title: "Frená las compras en cuotas",
      text: `Este mes pagás ${ars(input.cuotasCents)} en cuotas (${pct(cuotasPct)} del sueldo). Hasta que bajen del ${pct(LIMITS.cuotas.ok)}, mejor no sumar nuevas.`,
    });
  if (months < LIMITS.emergencyMonths.min)
    tips.push({
      key: "emergency",
      tone: months < 1 ? "bad" : "warn",
      title: input.hasEmergencyGoal ? "Seguí con el fondo de emergencia" : "Armá un fondo de emergencia",
      text:
        `La meta es ${ars(emergencyTarget)} (3 meses de gastos necesarios)` +
        (monthsToTarget ? `: con ${ars(savings)} por mes llegás en ${monthsToTarget} ${monthsToTarget === 1 ? "mes" : "meses"}.` : ".") +
        " Tenelo en una cuenta remunerada o un fondo money market, que se puede sacar en el día.",
    });
  if (idle >= 5_000_000 && idleLoss > 0)
    tips.push({
      key: "idle",
      tone: "warn",
      title: "Tenés plata quieta en la cuenta",
      text: `Unos ${ars(idle)} sobran para lo que queda del mes. Con la inflación pierden ${ars(idleLoss)} por mes: pasalos a una cuenta remunerada o al fondo de emergencia.`,
    });
  if (net > 0 && savingsRate < split.savings - 0.005)
    tips.push({
      key: "pay-yourself",
      tone: savingsRate < 0 ? "bad" : "warn",
      title: savingsRate < 0 ? "A este ritmo el mes cierra en rojo" : "A este ritmo ahorrás menos de lo planeado",
      text: `Proyectado: ${ars(Math.max(0, projectedSavings))} de ${ars(savings)}. El día de cobro separá el ahorro primero y gastá con lo que queda.`,
    });
  const subs = input.spentByCategory.Suscripciones ?? 0;
  if (net > 0 && subs > net * 0.03)
    tips.push({
      key: "subs",
      tone: "warn",
      title: "Revisá las suscripciones",
      text: `Van ${ars(subs)} este mes (${pct(subs / net)} del sueldo). Cancelá las que no usaste en el último mes.`,
    });
  if (!input.hasBudgets)
    tips.push({
      key: "budgets",
      tone: "warn",
      title: "Poné topes por categoría",
      text: "Con el presupuesto sugerido de abajo, la app te avisa al llegar al 80 % de cada categoría.",
    });
  if (tips.length === 0)
    tips.push({ key: "ok", tone: "good", title: "Vas bien", text: "Estás dentro del plan. Si te sobra algo a fin de mes, mandalo al ahorro antes de que se gaste." });

  return {
    netIncomeCents: net,
    split,
    blocks,
    suggestedBudgets,
    fixedCents: fixed,
    fixedOverflowCents: overflow,
    emergency: { targetCents: emergencyTarget, idealCents: monthlyEssentials * LIMITS.emergencyMonths.ideal, savedCents: input.emergencySavedCents, months, monthsToTarget },
    idle: { cents: idle, monthlyLossCents: idleLoss },
    projectedSavingsCents: projectedSavings,
    indicators,
    tips,
  };
}
