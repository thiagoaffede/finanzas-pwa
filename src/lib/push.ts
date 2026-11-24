import { sendNotification, setVapidDetails } from "web-push";
import type { Db } from "@/lib/data/db-type";
import { deletePushSubscription, listPushSubscriptions } from "@/lib/data/repository";
import type { PushPayload } from "./alerts";

/** Web Push con claves VAPID (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). Sin ellas, los avisos quedan apagados. */
export function pushConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

/**
 * "Contacto" que va firmado en cada aviso. Apple (iPhone) rechaza el envío si no es un mailto o https
 * real, así que si VAPID_SUBJECT falta o es de un dominio local se usa la URL pública de la app.
 */
export function vapidSubject(env: Record<string, string | undefined> = process.env): string {
  const s = env.VAPID_SUBJECT?.trim();
  const valid = s && /^(mailto:[^@\s]+@[^@\s]+\.[a-z]{2,}|https:\/\/[^\s]+)$/i.test(s) && !/\.(local|localhost|test|invalid|example)\b/i.test(s);
  if (valid) return s!;
  const host = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL;
  return host ? `https://${host}` : "https://github.com/thiagoaffede/finanzas-pwa";
}

let configured = false;
function configure() {
  if (configured) return;
  setVapidDetails(vapidSubject(), process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

/** Manda el aviso a todos los dispositivos suscriptos y limpia los que ya no existen. */
export async function sendToAll(db: Db, payload: PushPayload): Promise<{ sent: number; removed: number; failed: number; errors: string[] }> {
  configure();
  const subs = await listPushSubscriptions(db);
  let sent = 0;
  let removed = 0;
  let failed = 0;
  const errors: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await deletePushSubscription(db, s.endpoint);
          removed++;
        } else {
          failed++;
          const body = String((e as { body?: unknown }).body ?? (e as Error).message ?? "").slice(0, 200);
          errors.push(`${new URL(s.endpoint).hostname}: ${status ?? "sin respuesta"} ${body}`.trim());
          console.error("push error", status, body);
        }
      }
    }),
  );
  return { sent, removed, failed, errors };
}
