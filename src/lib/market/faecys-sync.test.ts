import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/data/db-type";
import * as repo from "@/lib/data/repository";
import fixtures from "@/lib/parsers/__fixtures__/faecys-circulares.json";
import { pickLatestCircular, scalesSyncDue, syncFaecysScales } from "./faecys-sync";

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

const post = (date: string, title: string, pdf: string) => ({
  date,
  link: `https://www.faecys.org.ar/${date}/`,
  title: { rendered: title },
  content: { rendered: `<p><a href="https://www.faecys.org.ar/faecys/wp-content/uploads/${pdf}">PDF</a></p>` },
});
const POSTS = [
  post("2026-11-02T10:00:00", "FAECYS &#8211; Acuerdo y Escalas Salariales Rama Turismo", "TURISMO.pdf"),
  post("2026-10-29T13:58:15", "Circular Escalas Acuerdo Octubre 2026 CCT 130", "2026/10/OCT.pdf"),
  post("2026-04-07T18:45:07", "FAECYS &#8211; Circular Escalas Salariales Abril 2026 Julio 2026 CCT 130/75 Rama Gremial", "2026/03/ABR.pdf"),
  post("2025-06-17T09:40:07", "Circular &#8211; Acuerdo y Escalas &#8211; Cereales", "CEREALES.pdf"),
];

/** Circular falsa con las 21 categorías (copia la página de Maestranza A cambiando el título). */
function fullCircular(): string[] {
  const base = fixtures.oct2026[1];
  const cats = [
    ["MAESTRANZA", "ABC"], ["ADMINISTRATIVO", "ABCDEF"], ["CAJEROS", "ABC"], ["AUXILIAR", "ABC"],
    ["AUXILIAR ESPECIALIZADO", "AB"], ["VENDEDOR", "ABCD"],
  ] as const;
  const pages = [fixtures.oct2026[0]];
  for (const [g, letters] of cats) for (const l of letters) pages.push(base.replace("MAESTRANZA\nA\n", `${g}\n${l}\n`));
  return pages;
}

function fakeFetch() {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("wp-json")) return new Response("﻿" + JSON.stringify(POSTS), { status: 200 });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("sincronización de escalas FAECYS", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
  }, 30_000);

  it("elige la circular general más nueva (no Turismo ni Cereales)", () => {
    expect(pickLatestCircular(POSTS)).toMatchObject({ title: "Circular Escalas Acuerdo Octubre 2026 CCT 130", pdfUrl: expect.stringContaining("2026/10/OCT.pdf") });
    expect(pickLatestCircular({})).toBeNull();
  });

  it("carga todas las categorías mes por mes y no vuelve a bajar la misma circular", async () => {
    const { fetcher, calls } = fakeFetch();
    const r = await syncFaecysScales(db, { fetcher, readPdf: async () => fullCircular(), now: new Date("2026-11-25T11:00:00Z") });
    expect(r).toMatchObject({ ok: true, agreement: "10/2026", categories: 21, from: "2026-10", to: "2027-05", saved: 168 });
    const scales = await repo.listScales(db);
    expect(scales).toHaveLength(168);
    const nov = scales.find((s) => s.category === "VENDEDOR_D" && s.validFrom === "2026-11-01");
    expect(nov).toMatchObject({ basicCents: 123_344_800, nonRemunerativeCents: 12_000_000, oneTimeNonRemunerativeCents: 2_500_000, validTo: "2026-11-30" });

    const again = await syncFaecysScales(db, { fetcher, readPdf: async () => fullCircular() });
    expect(again).toMatchObject({ ok: true, unchanged: true });
    expect(calls.filter((u) => u.endsWith(".pdf"))).toHaveLength(1);
  });

  it("si la circular cambió de formato no carga nada y conserva la anterior", async () => {
    const { fetcher } = fakeFetch();
    const r = await syncFaecysScales(db, { fetcher, force: true, readPdf: async () => fixtures.oct2026 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cambió de formato/);
    expect(r.agreement).toBe("10/2026");
    expect(await repo.listScales(db)).toHaveLength(168);
    expect(scalesSyncDue(r, new Date(r.at))).toBe(false);
  });
});
