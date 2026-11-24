import { describe, expect, it } from "vitest";
import { vapidSubject } from "./push";

describe("contacto VAPID", () => {
  it("usa VAPID_SUBJECT si es válido", () => {
    expect(vapidSubject({ VAPID_SUBJECT: "mailto:yo@gmail.com" })).toBe("mailto:yo@gmail.com");
    expect(vapidSubject({ VAPID_SUBJECT: "https://mi-app.vercel.app" })).toBe("https://mi-app.vercel.app");
  });
  it("descarta dominios locales o inválidos y usa la URL de la app", () => {
    expect(vapidSubject({ VAPID_SUBJECT: "mailto:avisos@finanzas.local", VERCEL_PROJECT_PRODUCTION_URL: "finanzas.vercel.app" })).toBe("https://finanzas.vercel.app");
    expect(vapidSubject({ VAPID_SUBJECT: "avisos", VERCEL_URL: "x.vercel.app" })).toBe("https://x.vercel.app");
    expect(vapidSubject({})).toMatch(/^https:\/\//);
  });
});
