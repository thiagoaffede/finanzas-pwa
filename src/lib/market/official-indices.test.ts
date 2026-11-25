import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/data/db-type";
import * as repo from "@/lib/data/repository";
import { indicesSyncDue, parseIclResponse, parseIpcResponse, syncOfficialIndices } from "./official-indices";

async function freshDb(): Promise<Db> {
  const client = new PGlite();
  const dir = path.resolve(import.meta.dirname, "../../../drizzle");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(path.join(dir, file), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await client.exec(stmt);
    }
  }
  return drizzle(client, { schema }) as unknown as Db;
}

// Formas reales de las respuestas (recortadas).
const IPC_BODY = {
  data: [
    ["2016-12-01", null],
    ["2026-08-01", 0.016592064235202875],
    ["2026-09-01", 0.01933610203208236],
  ],
  count: 3,
};
const iclBody = (rows: [string, number][]) => ({
  status: 200,
  results: [{ idVariable: 40, detalle: rows.map(([fecha, valor]) => ({ fecha, valor })) }],
});

function fakeFetch(handlers: { ipc: () => unknown; icl: (url: string) => unknown }) {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const body = url.includes("datos.gob.ar") ? handlers.ipc() : handlers.icl(url);
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("parsers de índices oficiales", () => {
  it("IPC: variación mensual como fracción, salteando el primer mes sin dato", () => {
    expect(parseIpcResponse(IPC_BODY)).toEqual([
      { date: "2026-08-01", value: 0.01659206 },
      { date: "2026-09-01", value: 0.0193361 },
    ]);
    expect(() => parseIpcResponse({ error: "x" })).toThrow();
  });

  it("ICL: v4 (detalle) y v3 (results planos), ordenado por fecha", () => {
    expect(parseIclResponse(iclBody([["2026-11-25", 37.75], ["2026-11-24", 37.73]]))).toEqual([
      { date: "2026-11-24", value: 37.73 },
      { date: "2026-11-25", value: 37.75 },
    ]);
    expect(parseIclResponse({ results: [{ fecha: "2026-11-25", valor: 37.75 }, { fecha: "mal", valor: 1 }] })).toEqual([{ date: "2026-11-25", value: 37.75 }]);
  });

  it("cuándo corresponde actualizar", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    expect(indicesSyncDue(null, now)).toBe(true);
    const base = { ipc: { ok: true, saved: 0, last: null }, icl: { ok: true, saved: 0, last: null } };
    expect(indicesSyncDue({ ...base, at: "2026-11-25T08:00:00Z" }, now)).toBe(false);
    expect(indicesSyncDue({ ...base, at: "2026-11-24T08:00:00Z" }, now)).toBe(true);
  });
});

describe("syncOfficialIndices (PGlite)", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
  }, 30_000);

  it("primera vez: serie completa del ICL, IPC mensual y registro en ajustes; pisa lo cargado a mano", async () => {
    await repo.upsertIndexValues(db, "IPC", [{ date: "2026-09-01", value: 0.025 }], "a mano");
    const { fetcher, calls } = fakeFetch({ ipc: () => IPC_BODY, icl: () => iclBody([["2026-11-24", 37.73], ["2026-11-25", 37.75]]) });
    const r = await syncOfficialIndices(db, { fetcher, today: "2026-11-25", now: new Date("2026-11-25T11:00:00Z") });

    expect(r.ipc).toMatchObject({ ok: true, saved: 2, last: { date: "2026-09-01" } });
    expect(r.icl).toMatchObject({ ok: true, saved: 2, last: { date: "2026-11-25", value: 37.75 } });
    expect(calls.find((u) => u.includes("bcra"))).toContain("desde=2020-07-01&hasta=2026-11-25");

    const idx = await repo.getIndices(db);
    expect(idx.ipc?.find((p) => p.month === "2026-09")?.rate).toBeCloseTo(0.0193361, 6);
    expect(idx.icl?.map((p) => p.value)).toEqual([37.73, 37.75]);
    expect((await repo.getSettings(db)).indicesSync?.at).toBe("2026-11-25T11:00:00.000Z");
  });

  it("después pide el ICL desde unos días antes del último y solo guarda lo nuevo; si una fuente falla, la otra igual se guarda", async () => {
    const { fetcher, calls } = fakeFetch({
      ipc: () => new TypeError("fetch failed"),
      icl: () => iclBody([["2026-11-25", 37.75], ["2026-11-26", 37.78]]),
    });
    const r = await syncOfficialIndices(db, { fetcher, today: "2026-11-26" });
    expect(calls.find((u) => u.includes("bcra"))).toContain("desde=2026-11-15&hasta=2026-11-26");
    expect(r.icl).toMatchObject({ ok: true, saved: 1 });
    expect(r.ipc.ok).toBe(false);
    expect(r.ipc.error).toMatch(/^IPC \(INDEC\)/);
    expect((await repo.getIndices(db)).icl ?? []).toHaveLength(3);
    expect((await repo.getSettings(db)).indicesSync?.ipc.ok).toBe(false);
  });

  it("guarda miles de valores de una (en lotes)", async () => {
    const rows: { date: string; value: number }[] = [];
    for (let i = 0; i < 1200; i++) rows.push({ date: new Date(Date.UTC(2021, 0, 1 + i)).toISOString().slice(0, 10), value: 2 + i / 1000 });
    await repo.upsertIndexValues(db, "ICL", rows, "BCRA");
    expect(((await repo.getIndices(db)).icl ?? []).length).toBeGreaterThanOrEqual(1200);
  });
});
