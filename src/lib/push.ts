import { sendNotification, setVapidDetails } from "web-push";
import type { Db } from "@/lib/data/db-type";
import { deletePushSubscription, listPushSubscriptions } from "@/lib/data/repository";
import type { PushPayload } from "./alerts";

/** Web Push con claves VAPID (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). Sin ellas, los avisos quedan apagados. */
export function pushConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

let configured = false;
function configure() {
  if (configured) return;
  setVapidDetails(process.env.VAPID_SUBJECT || "mailto:avisos@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

/** Manda el aviso a todos los dispositivos suscriptos y limpia los que ya no existen. */
export async function sendToAll(db: Db, payload: PushPayload): Promise<{ sent: number; removed: number; failed: number }> {
  configure();
  const subs = await listPushSubscriptions(db);
  let sent = 0;
  let removed = 0;
  let failed = 0;
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
        } else failed++;
      }
    }),
  );
  return { sent, removed, failed };
}
