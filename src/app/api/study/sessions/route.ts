import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { createSession } from "@/lib/data/study";
import { sessionInput } from "@/lib/study/schemas";

export async function POST(req: Request) {
  const body = await parseBody(req, sessionInput);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  return json(await createSession(db, body.data), { status: 201 });
}
