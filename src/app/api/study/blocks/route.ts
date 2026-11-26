import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { createBlock } from "@/lib/data/study";
import { blockInput } from "@/lib/study/schemas";

export async function POST(req: Request) {
  const body = await parseBody(req, blockInput);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await createBlock(db, body.data), { status: 201 });
}
