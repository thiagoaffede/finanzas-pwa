import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function noDatabase() {
  return json({ error: "Base de datos no configurada (falta DATABASE_URL). El dato quedó guardado en el dispositivo." }, { status: 503 });
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: json({ error: "JSON inválido" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, res: json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 422 }) };
  return { ok: true, data: parsed.data };
}
