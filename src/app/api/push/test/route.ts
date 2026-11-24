import { json } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { pushConfigured, sendToAll } from "@/lib/push";

/** Manda un aviso de prueba a todos los dispositivos. */
export async function POST() {
  if (!pushConfigured()) return json({ error: "Faltan las claves VAPID en el servidor." }, { status: 501 });
  const { db, res } = requireDb();
  if (!db) return res;
  const r = await sendToAll(db, { title: "Avisos activados", body: "Así te vamos a avisar de los vencimientos.", url: "/", tag: "prueba" });
  return json(r);
}
