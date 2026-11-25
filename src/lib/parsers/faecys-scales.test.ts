import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/faecys-circulares.json";
import { circularToScales, parseFaecysCircular, pesosToCents } from "./faecys-scales";
import { estimateCommerceSalary } from "@/lib/finance/commerce-union";

describe("circular de escalas FAECYS", () => {
  it("importes con punto de miles y coma decimal", () => {
    expect(pesosToCents("1.233.448")).toBe(123_344_800);
    expect(pesosToCents("287.967,32")).toBe(28_796_732);
    expect(pesosToCents("0")).toBe(0);
    expect(pesosToCents("1.2.3")).toBeNull();
  });

  it("octubre 2026: categorías de mayores, la suma por única vez aparte; menores y adicionales afuera", () => {
    const c = parseFaecysCircular(fixtures.oct2026);
    expect(c.agreement).toBe("10/2026");
    expect(c.pages.map((p) => p.category)).toEqual(["MAESTRANZA_A", "MAESTRANZA_B", "VENDEDOR_B"]);
    const m = c.pages[0];
    expect(m.rows).toHaveLength(8);
    expect(m.rows[1]).toEqual({ month: "2026-11", basicCents: 123_344_800, nonRemunerativeCents: 12_000_000, oneTimeCents: 2_500_000 });
    expect(m.rows[7]).toEqual({ month: "2027-05", basicCents: 137_822_200, nonRemunerativeCents: 0, oneTimeCents: 0 });
  });

  it("abril 2026: las dos sumas fijas llevan antigüedad y presentismo (van juntas)", () => {
    const c = parseFaecysCircular(fixtures.abr2026);
    expect(c.agreement).toBe("04/2026");
    expect(c.pages[0].category).toBe("MAESTRANZA_A");
    expect(c.pages[0].rows[0]).toEqual({ month: "2026-04", basicCents: 107_891_100, nonRemunerativeCents: 12_000_000, oneTimeCents: 0 });
    expect(c.pages[0].rows.at(-1)?.month).toBe("2026-07");
  });

  it("una escala por mes; el último mes queda vigente hasta la próxima circular", () => {
    const scales = circularToScales(parseFaecysCircular(fixtures.oct2026), "FAECYS acuerdo 10/2026");
    const m = scales.filter((s) => s.category === "MAESTRANZA_A");
    expect(m[0]).toMatchObject({ validFrom: "2026-10-01", validTo: "2026-10-31", oneTimeNonRemunerativeCents: 2_500_000, source: "FAECYS acuerdo 10/2026" });
    expect(m.at(-1)).toMatchObject({ validFrom: "2027-05-01", validTo: null });
  });

  it("el estimador no aplica antigüedad ni presentismo a la suma por única vez", () => {
    const scales = circularToScales(parseFaecysCircular(fixtures.oct2026), "FAECYS");
    const e = estimateCommerceSalary({ scales, category: "MAESTRANZA_A", date: "2026-11-15", seniorityYears: 10, presentismo: true });
    const line = (code: string) => e.lines.find((l) => l.code === code)?.amountCents ?? 0;
    expect(line("BAS")).toBe(123_344_800);
    expect(line("NR")).toBe(12_000_000);
    expect(line("NR_ANT")).toBe(1_200_000);
    expect(line("NR_UNICA")).toBe(2_500_000);
    expect(e.nonRemunerativeCents).toBe(12_000_000 + 1_200_000 + line("NR_PRES") + 2_500_000);
  });
});
