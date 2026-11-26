import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { createEvent } from "@/lib/data/study";
import { eventInput } from "@/lib/study/schemas";

export async function POST(req: Request) {
  const body = await parseBody(req, eventInput);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await createEvent(db, body.data), { status: 201 });
}
