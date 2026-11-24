import { describe, expect, it } from "vitest";
import { parseBillExtraction, detectProvider } from "./bill-parser";
import { parsePayslipExtraction } from "./payslip-parser";
import { normalizeDate, normalizePeriod } from "./normalize";

describe("normalize", () => {
  it("fechas", () => {
    expect(normalizeDate("24/11/2026")).toBe("2026-11-24");
    expect(normalizeDate("5-1-26")).toBe("2026-01-05");
    expect(normalizeDate("2026-11-24")).toBe("2026-11-24");
    expect(normalizeDate("32/13/2026")).toBeNull();
  });
  it("períodos", () => {
    expect(normalizePeriod("11/2026")).toBe("2026-11");
    expect(normalizePeriod("Noviembre 2026")).toBe("2026-11");
    expect(normalizePeriod("nov-26")).toBe("2026-11");
    expect(normalizePeriod("Septiembre de 2026")).toBe("2026-09");
  });
});

describe("bill-parser", () => {
  it("detecta proveedores", () => {
    expect(detectProvider("EDES S.A.")).toBe("EDES");
    expect(detectProvider("Camuzzi Gas Pampeana")).toBe("CAMUZZI");
    expect(detectProvider("Telecom Argentina - Personal")).toBe("PERSONAL");
    expect(detectProvider("Municipalidad")).toBe("OTRO");
  });
  it("normaliza una boleta", () => {
    const r = parseBillExtraction({ emisor: "Camuzzi Gas Pampeana", periodo: "10/2026", vencimiento: "18/11/2026", monto: "$ 45.320,50" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ provider: "CAMUZZI", billingPeriod: "2026-10", dueDate: "2026-11-18", amountCents: 4_532_050 });
  });
  it("rechaza datos ilegibles", () => {
    const r = parseBillExtraction({ emisor: "EDES", periodo: null, vencimiento: "mañana", monto: "?" });
    expect(r.ok).toBe(false);
  });
});

describe("payslip-parser", () => {
  it("suma haberes y descuentos y controla el neto", () => {
    const r = parsePayslipExtraction({
      periodo: "Octubre 2026",
      haberes: [
        { concepto: "Sueldo básico", monto: "1.000.000,00", remunerativo: true },
        { concepto: "Suma no rem.", monto: "100.000,00", remunerativo: false },
      ],
      descuentos: [{ concepto: "Jubilación", monto: "110.000,00" }],
      neto: "990.000,00",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.period).toBe("2026-10");
      expect(r.value.remunerativeCents).toBe(100_000_000);
      expect(r.value.netCents).toBe(99_000_000);
      expect(r.warnings).toEqual([]);
    }
  });
  it("avisa si el neto no cierra", () => {
    const r = parsePayslipExtraction({
      periodo: "10/2026",
      haberes: [{ concepto: "Básico", monto: "1000", remunerativo: true }],
      descuentos: [],
      neto: "900",
    });
    expect(r.ok && r.warnings.length).toBe(1);
  });
});
