import type { Cents, DueBucket, ISODate } from "@/types/finance";
import { diffDays } from "./dates";

/** Centro de vencimientos: semáforo por cercanía. */

export interface DueItem {
  id: string;
  label: string;
  amountCents: Cents;
  dueDate: ISODate;
  paid: boolean;
  kind: "bill" | "installment" | "rent" | "card" | "other";
}

export function classifyDue(dueDate: ISODate, today: ISODate, paid: boolean): DueBucket {
  if (paid) return "paid";
  const d = diffDays(today, dueDate);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 3) return "next3";
  if (d <= 7) return "week";
  return "later";
}

export const DUE_BUCKET_ORDER: DueBucket[] = ["overdue", "today", "next3", "week", "later", "paid"];

export const DUE_BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Vencido",
  today: "Vence hoy",
  next3: "Próximos 3 días",
  week: "Esta semana",
  later: "Más adelante",
  paid: "Pagado",
};

export interface DueGroup {
  bucket: DueBucket;
  label: string;
  items: (DueItem & { daysLeft: number })[];
  totalCents: Cents;
}

export function groupDueItems(items: DueItem[], today: ISODate): DueGroup[] {
  const groups = new Map<DueBucket, DueGroup>();
  for (const item of items) {
    const bucket = classifyDue(item.dueDate, today, item.paid);
    const g = groups.get(bucket) ?? { bucket, label: DUE_BUCKET_LABEL[bucket], items: [], totalCents: 0 };
    g.items.push({ ...item, daysLeft: diffDays(today, item.dueDate) });
    g.totalCents += item.amountCents;
    groups.set(bucket, g);
  }
  for (const g of groups.values()) g.items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return DUE_BUCKET_ORDER.filter((b) => groups.has(b)).map((b) => groups.get(b)!);
}
