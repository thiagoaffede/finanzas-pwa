import type { ISODate } from "@/types/finance";
import { addMonths, daysInMonth, monthOf, parseISODate, toISODate } from "./dates";

/**
 * Fecha de pago de la cuota `n` (1 = primera) de una compra con tarjeta.
 * Con día de cierre y de vencimiento: lo comprado hasta el cierre entra en el resumen
 * que vence el mes siguiente; lo comprado después, en el de dos meses después.
 * Sin esos datos, la cuota vence el mismo día del mes siguiente.
 */
export function cardInstallmentDue(purchase: ISODate, n: number, card?: { closingDay?: number | null; dueDay?: number | null } | null): ISODate {
  const { day } = parseISODate(purchase);
  if (card?.closingDay && card?.dueDay) {
    const firstMonth = addMonths(monthOf(purchase), day <= card.closingDay ? 1 : 2);
    const month = addMonths(firstMonth, n - 1);
    const [y, m] = month.split("-").map(Number);
    return toISODate(y, m, Math.min(card.dueDay, daysInMonth(month)));
  }
  const month = addMonths(monthOf(purchase), n);
  const [y, m] = month.split("-").map(Number);
  return toISODate(y, m, Math.min(day, daysInMonth(month)));
}
