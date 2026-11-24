/* Service Worker básico: caché del shell para abrir sin conexión.
 * - Navegación: network-first, cae a la versión cacheada (o "/" ) si no hay red.
 * - Estáticos de Next (/_next/static, íconos): cache-first.
 * - GET /api/*: network-first con respaldo en caché (tablero y cotizaciones offline).
 * La cola de gastos offline vive en el cliente (localStorage) y se sincroniza al volver la red.
 */
const VERSION = "v2";
const SHELL = `shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;
const PRECACHE = ["/", "/movimientos", "/sueldo-alquiler", "/planificacion", "/calculadoras", "/configuracion", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, RUNTIME].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(RUNTIME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = (await caches.match(request)) || (fallbackUrl && (await caches.match(fallbackUrl)));
    if (cached) return cached;
    throw new Error("offline");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(RUNTIME)).put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  } else if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/export") && !url.pathname.startsWith("/api/documents")) {
    event.respondWith(networkFirst(request));
  }
});

// ─── Avisos push (vencimientos) ─────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Mis Finanzas", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Mis Finanzas", {
      body: data.body || "",
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
