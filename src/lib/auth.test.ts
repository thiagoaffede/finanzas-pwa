import { describe, expect, it } from "vitest";
import { createSessionToken, isPublicPath, passwordMatches, verifySessionToken } from "./auth";

const env = { APP_PASSWORD: "secreta-123" };

describe("auth", () => {
  it("valida la contraseña", async () => {
    expect(await passwordMatches("secreta-123", env)).toBe(true);
    expect(await passwordMatches("otra", env)).toBe(false);
    expect(await passwordMatches("", {})).toBe(false);
  });

  it("firma y verifica la sesión", async () => {
    const token = await createSessionToken(env, 0);
    expect(await verifySessionToken(token, env, 1000)).toBe(true);
  });

  it("rechaza sesiones vencidas, adulteradas o de otra contraseña", async () => {
    const token = await createSessionToken(env, 0);
    expect(await verifySessionToken(token, env, 200 * 86_400_000)).toBe(false);
    const [exp, sig] = token.split(".");
    expect(await verifySessionToken(`${Number(exp) + 1}.${sig}`, env, 0)).toBe(false);
    expect(await verifySessionToken(token, { APP_PASSWORD: "cambiada" }, 0)).toBe(false);
    expect(await verifySessionToken("basura", env, 0)).toBe(false);
    expect(await verifySessionToken(undefined, env, 0)).toBe(false);
  });

  it("rutas públicas", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/auth/login")).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/api/transactions")).toBe(false);
  });
});
