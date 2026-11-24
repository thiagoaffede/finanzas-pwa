import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { rentContractInput } from "@/lib/schemas";
import { getActiveRentContract, saveRentContract } from "@/lib/data/repository";
import { loadFinanceContext } from "@/lib/data/context";
import { addMonthsToDate, nextRentAdjustment, rentAdjustments, todayAR } from "@/lib/finance";

export const dynamic = "force-dynamic";

const calcInput = z.object({
  contract: rentContractInput,
  projectedMonthlyInflation: z.number().min(0).max(1).default(0),
});

function toContract(c: z.infer<typeof rentContractInput>) {
  return { ...c, durationMonths: c.durationMonths ?? undefined, fixedRate: c.fixedRate ?? undefined };
}

export async function GET() {
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await getActiveRentContract(db));
}

/** Calcula los ajustes de un contrato con los índices cargados. */
export async function POST(req: Request) {
  const body = await parseBody(req, calcInput);
  if (!body.ok) return body.res;
  const today = todayAR();
  const { indices } = await loadFinanceContext(today);
  const contract = toContract(body.data.contract);
  const opts = { projectedMonthlyInflation: body.data.projectedMonthlyInflation };
  return json({
    adjustments: rentAdjustments(contract, indices, addMonthsToDate(contract.startDate, contract.durationMonths ?? 36), opts),
    next: nextRentAdjustment(contract, indices, today, opts),
  });
}

const saveInput = rentContractInput.extend({ dueDay: z.number().int().min(1).max(31).default(10) });

/** Guarda el contrato como el vigente. */
export async function PUT(req: Request) {
  const body = await parseBody(req, saveInput);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await saveRentContract(db, { ...toContract(body.data), dueDay: body.data.dueDay }));
}
