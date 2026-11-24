import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { deleteBill, setBillPaid, updateBill } from "@/lib/data/repository";
import { billPatch, billPayment } from "@/lib/schemas";
import { todayAR } from "@/lib/finance";

type Ctx = { params: Promise<{ id: string }> };

/** Con `paid`: marca pagada (registra el pago en la cuenta) o pendiente. Sin `paid`: edita la boleta. */
export async function PATCH(req: Request, { params }: Ctx) {
  const raw = await req.clone().json().catch(() => null);
  const { db, res } = requireDb();
  const id = (await params).id;
  if (raw && typeof raw === "object" && "paid" in raw) {
    const body = await parseBody(req, billPayment);
    if (!body.ok) return body.res;
    if (!db) return res;
    const { paid, accountId, amountCents, date } = body.data;
    const row = await setBillPaid(db, id, paid, date ?? todayAR(), { accountId, amountCents });
    return row ? json(row) : json({ error: "No existe" }, { status: 404 });
  }
  const body = await parseBody(req, billPatch);
  if (!body.ok) return body.res;
  if (!db) return res;
  const row = await updateBill(db, id, body.data);
  return row ? json(row) : json({ error: "No existe" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { db, res } = requireDb();
  if (!db) return res;
  const row = await deleteBill(db, (await params).id);
  return row ? json({ ok: true }) : json({ error: "No existe" }, { status: 404 });
}
