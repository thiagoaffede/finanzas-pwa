import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { estimateCommerceSalary, todayAR, type CommerceCategory } from "@/lib/finance";
import { demoScales } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

const input = z.object({
  category: z.string().default("AUXILIAR_C"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  seniorityYears: z.number().min(0).max(60),
  weeklyHours: z.number().min(1).max(48).optional(),
  presentismo: z.boolean().optional(),
});

/** Estimación de sueldo de comercio con la escala vigente. */
export async function POST(req: Request) {
  const body = await parseBody(req, input);
  if (!body.ok) return body.res;
  const today = todayAR();
  try {
    const estimate = estimateCommerceSalary({
      scales: demoScales(today),
      ...body.data,
      category: body.data.category as CommerceCategory,
      date: body.data.date ?? today,
    });
    return json(estimate);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
