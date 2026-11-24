import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDollarCache, arsToUsdCents, getDollarQuotes } from "./dollar-client";

const sample = [
  { moneda: "USD", casa: "blue", nombre: "Blue", compra: 1200, venta: 1220.5, fechaActualizacion: "2026-11-24T15:00:00.000Z" },
  { moneda: "USD", casa: "oficial", nombre: "Oficial", compra: 1100, venta: 1150, fechaActualizacion: "2026-11-24T15:00:00.000Z" },
];

describe("dollar-client", () => {
  beforeEach(() => __resetDollarCache());

  it("normaliza, ordena y cachea", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(sample)));
    const a = await getDollarQuotes({ fetcher, now: 0 });
    expect(a.quotes.map((q) => q.house)).toEqual(["oficial", "blue"]);
    expect(a.quotes[1].sellCents).toBe(122_050);
    await getDollarQuotes({ fetcher, now: 60_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("si la API falla devuelve el último valor como viejo", async () => {
    await getDollarQuotes({ fetcher: async () => new Response(JSON.stringify(sample)), now: 0 });
    const r = await getDollarQuotes({ fetcher: async () => new Response("", { status: 503 }), now: 3_600_000 });
    expect(r.stale).toBe(true);
    expect(r.quotes).toHaveLength(2);
  });

  it("convierte pesos a USD", () => {
    expect(arsToUsdCents(115_000_000, { house: "oficial", name: "Oficial", buyCents: null, sellCents: 115_000, updatedAt: "" })).toBe(100_000);
  });
});
