"use client";

/**
 * Cola offline simple para gastos: si no hay red (o no hay base configurada),
 * el gasto se guarda en localStorage y se reintenta al volver la conexión.
 * Cada gasto lleva un `clientId` para que el server no lo duplique.
 */

import type { TransactionInput } from "@/lib/schemas";

const KEY = "finanzas.pendingTransactions";

export type QueuedTransaction = TransactionInput & { clientId: string; queuedAt: string };

export function readQueue(): QueuedTransaction[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedTransaction[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function enqueue(tx: QueuedTransaction) {
  writeQueue([...readQueue(), tx]);
}

/** Intenta enviar todo lo pendiente. Devuelve cuántos quedaron en cola. */
export async function flushQueue(): Promise<number> {
  const queue = readQueue();
  const remaining: QueuedTransaction[] = [];
  for (const tx of queue) {
    try {
      const res = await fetch("/api/transactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tx) });
      // 503 = sin base configurada: queda local.
      if (!res.ok) remaining.push(tx);
    } catch {
      remaining.push(tx);
    }
  }
  writeQueue(remaining);
  return remaining.length;
}
