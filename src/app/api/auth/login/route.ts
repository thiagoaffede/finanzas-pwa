import { cookies } from "next/headers";
import { authEnabled, createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";
import { json } from "@/lib/api";

export async function POST(req: Request) {
  if (!authEnabled()) return json({ ok: true, auth: false });
  const body = (await req.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password || !(await passwordMatches(body.password))) {
    // Freno simple contra pruebas en masa.
    await new Promise((r) => setTimeout(r, 800));
    return json({ error: "Contraseña incorrecta" }, { status: 401 });
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return json({ ok: true });
}
