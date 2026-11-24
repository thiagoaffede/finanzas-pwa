/**
 * Login con una sola contraseña (APP_PASSWORD).
 *
 * La sesión es una cookie `expira.firma`, donde la firma es HMAC-SHA256 del vencimiento
 * con una clave derivada de APP_PASSWORD (+ AUTH_SECRET si existe). Cambiar la contraseña
 * invalida todas las sesiones. Usa Web Crypto para funcionar también en el proxy.
 * Si APP_PASSWORD no está definida, la app queda abierta (útil en desarrollo).
 */

export const SESSION_COOKIE = "fz_session";
export const SESSION_DAYS = 180;

const enc = new TextEncoder();

export function authEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.APP_PASSWORD);
}

async function hmacKey(env: Record<string, string | undefined>) {
  const material = `${env.APP_PASSWORD ?? ""}::${env.AUTH_SECRET ?? "finanzas-pwa"}`;
  return crypto.subtle.importKey("raw", enc.encode(material), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function createSessionToken(env: Record<string, string | undefined> = process.env, now = Date.now()): Promise<string> {
  const expires = String(now + SESSION_DAYS * 86_400_000);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(expires));
  return `${expires}.${toHex(sig)}`;
}

export async function verifySessionToken(token: string | undefined, env: Record<string, string | undefined> = process.env, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [expires, sigHex] = token.split(".");
  if (!expires || !sigHex || !/^\d+$/.test(expires) || Number(expires) < now) return false;
  const sig = fromHex(sigHex);
  if (!sig) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(env), sig, enc.encode(expires));
}

/** Compara contraseñas sin cortar en el primer carácter distinto. */
export async function passwordMatches(candidate: string, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const expected = env.APP_PASSWORD ?? "";
  if (!expected) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(candidate)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Rutas que se pueden ver sin sesión. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/health" ||
    // El cron se autentica con CRON_SECRET (ver la ruta), no con la cookie.
    pathname.startsWith("/api/cron/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  );
}
