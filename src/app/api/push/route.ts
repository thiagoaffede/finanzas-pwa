import { z } from "zod";
import { json, parseBody } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { deletePushSubscription, savePushSubscription } from "@/lib/data/repository";
import { pushConfigured } from "@/lib/push";

/** Clave pública para suscribirse (no es secreta). */
export async function GET() {
  return json({ enabled: pushConfigured(), publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
}

const sub = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export async function POST(req: Request) {
  const body = await parseBody(req, sub);
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  await savePushSubscription(db, {
    endpoint: body.data.endpoint,
    p256dh: body.data.keys.p256dh,
    auth: body.data.keys.auth,
    userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
  });
  return json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  const body = await parseBody(req, z.object({ endpoint: z.string().max(1000) }));
  if (!body.ok) return body.res;
  const { db, res } = requireDb();
  if (!db) return res;
  await deletePushSubscription(db, body.data.endpoint);
  return json({ ok: true });
}
