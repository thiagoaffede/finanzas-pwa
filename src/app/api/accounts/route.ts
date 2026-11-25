import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { createAccount, listAccounts } from "@/lib/data/repository";
import { accounts } from "@/lib/db/schema";

const input = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(accounts.kind.enumValues),
  balanceCents: z.number().int(),
  currency: z.enum(["ARS", "USD"]).default("ARS"),
});

export async function GET() {
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await listAccounts(db));
}

export async function POST(req: Request) {
  const body = await parseBody(req, input);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await createAccount(db, body.data), { status: 201 });
}
