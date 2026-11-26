import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { createMistake } from "@/lib/data/study";
import { mistakeInput } from "@/lib/study/schemas";

export async function POST(req: Request) {
  const body = await parseBody(req, mistakeInput);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await createMistake(db, body.data), { status: 201 });
}
