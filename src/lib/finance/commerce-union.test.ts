import { describe, expect, it } from "vitest";
import { compareEstimateWithPayslip, estimateCommerceSalary, findScale, type ScaleEntry } from "./commerce-union";

// Valores ficticios para test: NO son la escala oficial.
const scales: ScaleEntry[] = [
  { category: "AUXILIAR_C", validFrom: "2026-01-01", validTo: "2026-06-30", basicCents: 90_000_000, nonRemunerativeCents: 0 },
  { category: "AUXILIAR_C", validFrom: "2026-07-01", validTo: null, basicCents: 100_000_000, nonRemunerativeCents: 10_000_000 },
  { category: "AUXILIAR_B", validFrom: "2026-07-01", validTo: null, basicCents: 95_000_000, nonRemunerativeCents: 10_000_000 },
];

describe("findScale", () => {
  it("elige la escala vigente por fecha", () => {
    expect(findScale(scales, "AUXILIAR_C", "2026-03-15")?.basicCents).toBe(90_000_000);
    expect(findScale(scales, "AUXILIAR_C", "2026-11-01")?.basicCents).toBe(100_000_000);
    expect(findScale(scales, "AUXILIAR_C", "2025-12-31")).toBeNull();
  });
  it("si se superponen gana la más reciente", () => {
    const overlap: ScaleEntry[] = [...scales, { category: "AUXILIAR_C", validFrom: "2026-10-01", validTo: null, basicCents: 110_000_000, nonRemunerativeCents: 0 }];
    expect(findScale(overlap, "AUXILIAR_C", "2026-11-01")?.basicCents).toBe(110_000_000);
  });
});

describe("estimateCommerceSalary (Auxiliar C)", () => {
  it("calcula básico, antigüedad, presentismo, no remunerativos y descuentos", () => {
    const e = estimateCommerceSalary({ scales, category: "AUXILIAR_C", date: "2026-11-01", seniorityYears: 5.7 });
    const line = (code: string) => e.lines.find((l) => l.code === code)?.amountCents;
    expect(line("BAS")).toBe(100_000_000);
    expect(line("ANT")).toBe(5_000_000); // 5 años completos × 1 %
    expect(line("PRES")).toBe(8_750_000); // (básico + antig.) / 12
    expect(e.remunerativeCents).toBe(113_750_000);
    expect(e.nonRemunerativeCents).toBe(11_375_000); // 10M + 5 % + presentismo
    expect(line("JUB")).toBe(12_512_500);
    expect(line("PAMI")).toBe(3_412_500);
    expect(line("OS")).toBe(3_753_750);
    expect(line("FAECYS")).toBe(625_625);
    expect(line("SIND")).toBe(2_502_500);
    expect(e.deductionsCents).toBe(22_806_875);
    expect(e.grossCents).toBe(125_125_000);
    expect(e.netCents).toBe(102_318_125);
  });

  it("sin presentismo y jornada parcial", () => {
    const e = estimateCommerceSalary({ scales, category: "AUXILIAR_C", date: "2026-11-01", seniorityYears: 0, weeklyHours: 24, presentismo: false });
    expect(e.remunerativeCents).toBe(50_000_000);
    expect(e.nonRemunerativeCents).toBe(5_000_000);
    expect(e.lines.some((l) => l.code === "PRES")).toBe(false);
  });

  it("los porcentajes son configurables", () => {
    const e = estimateCommerceSalary({
      scales, category: "AUXILIAR_C", date: "2026-11-01", seniorityYears: 0, presentismo: false,
      config: { deductions: [{ code: "JUB", label: "Jub", rate: 0.11, base: "remunerative" }] },
    });
    expect(e.deductionsCents).toBe(11_000_000);
  });

  it("falla claro si no hay escala cargada", () => {
    expect(() => estimateCommerceSalary({ scales, category: "VENDEDOR_A", date: "2026-11-01", seniorityYears: 1 })).toThrow(/No hay escala/);
  });

  it("compara estimado vs liquidado", () => {
    const e = estimateCommerceSalary({ scales, category: "AUXILIAR_C", date: "2026-11-01", seniorityYears: 5 });
    const cmp = compareEstimateWithPayslip(e, {
      period: "2026-11",
      remunerativeCents: e.remunerativeCents,
      nonRemunerativeCents: e.nonRemunerativeCents,
      deductionsCents: e.deductionsCents,
      netCents: e.netCents + 5_000_000,
    });
    const net = cmp.find((c) => c.field === "netCents")!;
    expect(net.diffCents).toBe(5_000_000);
    expect(net.significant).toBe(true);
    expect(cmp.find((c) => c.field === "remunerativeCents")!.significant).toBe(false);
  });
});
