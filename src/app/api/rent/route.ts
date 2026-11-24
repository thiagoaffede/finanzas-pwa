import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { rentContractInput } from "@/lib/schemas";
import { addMonthsToDate, nextRentAdjustment, rentAdjustments, todayAR } from "@/lib/finance";
import { demoIndices } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

const calcInput = z.object({
  contract: rentContractInput,
  projectedMonthlyInflation: z.number().min(0).max(1).default(0),
});

/** Calcula los ajustes de un contrato. (Los índices reales salen de `index_values` al conectar la base.) */
export async function POST(req: Request) {
  const body = await parseBody(req, calcInput);
  if (!body.ok) return body.res;
  const today = todayAR();
  const { contract: c, projectedMonthlyInflation } = body.data;
  const contract = { ...c, durationMonths: c.durationMonths ?? undefined, fixedRate: c.fixedRate ?? undefined };
  const indices = demoIndices(today);
  const opts = { projectedMonthlyInflation };
  return json({
    adjustments: rentAdjustments(contract, indices, addMonthsToDate(contract.startDate, contract.durationMonths ?? 36), opts),
    next: nextRentAdjustment(contract, indices, today, opts),
  });
}
