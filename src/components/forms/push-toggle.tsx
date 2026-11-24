"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { send } from "@/lib/client-api";

type Status = "cargando" | "no-soportado" | "sin-claves" | "bloqueado" | "apagado" | "activo";

function keyToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Activa los avisos de vencimientos en este dispositivo. */
export function PushToggle({ canSave }: { canSave: boolean }) {
  const [status, setStatus] = useState<Status>("cargando");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const isIOS = typeof navigator !== "undefined" && /iphone|ipad/i.test(navigator.userAgent);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setStatus("no-soportado");
      const r = await fetch("/api/push").then((x) => x.json()).catch(() => null);
      if (!r?.enabled || !r.publicKey) return setStatus("sin-claves");
      setPublicKey(r.publicKey);
      if (Notification.permission === "denied") return setStatus("bloqueado");
      const reg = await navigator.serviceWorker.ready;
      setStatus((await reg.pushManager.getSubscription()) ? "activo" : "apagado");
    })();
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "bloqueado" : "apagado");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
      const r = await send("/api/push", "POST", sub.toJSON());
      if (!r.ok) {
        await sub.unsubscribe();
        setMsg({ text: r.error, ok: false });
        return;
      }
      setStatus("activo");
      await test();
    } catch {
      setMsg({ text: "No se pudo activar en este navegador.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  /** Manda un aviso de prueba y muestra qué pasó (antes no se veía nada si fallaba). */
  async function test() {
    setBusy(true);
    setMsg(null);
    const r = await send<{ sent: number; removed: number; failed: number; errors?: string[] }>("/api/push/test", "POST");
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error, ok: false });
    const { sent, removed, errors = [] } = r.data;
    if (sent > 0)
      return setMsg({
        text: `Enviado a ${sent} dispositivo${sent === 1 ? "" : "s"}. Si no te llega en unos segundos, revisá ${isIOS ? "Ajustes › Notificaciones › Finanzas" : "los permisos de notificaciones"}.`,
        ok: true,
      });
    if (removed > 0) {
      setStatus("apagado");
      return setMsg({ text: "Tu suscripción había vencido. Tocá “Activar en este dispositivo” de nuevo.", ok: false });
    }
    setMsg({ text: errors.length ? `No se pudo enviar: ${errors[0]}` : "No hay dispositivos activados.", ok: false });
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await send("/api/push", "DELETE", { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    setStatus("apagado");
    setBusy(false);
  }

  const text: Record<Status, string> = {
    cargando: "…",
    "no-soportado": isIOS
      ? "En iPhone primero agregá la app a la pantalla de inicio (Compartir → Agregar a inicio) y abrila desde ahí."
      : "Este navegador no permite avisos.",
    "sin-claves": "Los avisos no están configurados en el servidor (faltan las claves VAPID).",
    bloqueado: "Bloqueaste las notificaciones para esta app. Habilitalas desde los ajustes del navegador.",
    apagado: "Te avisamos 3 días antes, el día anterior y el mismo día de cada vencimiento, a las 8 de la mañana.",
    activo: "Activados en este dispositivo. Tocá “Probar” para recibir uno de prueba.",
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Avisos de vencimientos</CardTitle>
          <CardDescription>{text[status]}</CardDescription>
        </div>
        {status === "activo" ? <Bell className="h-4 w-4 text-good" /> : <BellOff className="h-4 w-4 text-ink-3" />}
      </CardHeader>
      {(status === "apagado" || status === "activo") && canSave && (
        <div className="flex flex-wrap items-center gap-3">
          {status === "apagado" ? (
            <Button disabled={busy} onClick={enable}>
              Activar en este dispositivo
            </Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={test}>
                Probar
              </Button>
              <Button variant="ghost" disabled={busy} onClick={disable}>
                Desactivar
              </Button>
            </>
          )}
          {msg && <span className={`text-xs ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</span>}
        </div>
      )}
    </Card>
  );
}
