"use client";

/** fetch JSON con manejo de errores uniforme para los formularios. */
export async function send<T = unknown>(url: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const error =
        res.status === 503
          ? "Conectá la base de datos para guardar cambios."
          : res.status === 401
            ? "Tu sesión venció. Volvé a entrar."
            : (data?.error as string) ?? `Error ${res.status}`;
      return { ok: false, error, status: res.status };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Sin conexión. Probá de nuevo.", status: 0 };
  }
}
