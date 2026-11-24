import { describe, expect, it } from "vitest";
import { billFromText, payslipFromText } from "./text-extraction";
import { parseBillExtraction } from "./bill-parser";
import { parsePayslipExtraction } from "./payslip-parser";

const CAMUZZI = `Camuzzi Gas Pampeana S.A.
Cliente N° 12345678/9
Período de consumo: Octubre 2026
Fecha de emisión 02/11/2026
1º Vencimiento 20/11/2026 $ 38.512,40
2º Vencimiento 27/11/2026 $ 39.120,00
Cargo fijo $ 4.100,00
TOTAL A PAGAR $ 38.512,40`;

const EDES = `EDES S.A. Empresa Distribuidora de Energía Sur
Nro. Cliente: 0045-112233
Período facturado 10/2026
Vto.: 28/11/2026
Importe a pagar
$ 45.000,00`;

const RECIBO = `RECIBO DE HABERES
Período liquidado: Octubre de 2026
Fecha de pago 03/11/2026
Sueldo básico 1.150.000,00
Total remunerativo 1.187.200,00
Total no remunerativo 45.200,00
Total descuentos 224.800,00
Neto a cobrar $ 1.007.600,00`;

describe("lectura sin IA de boletas", () => {
  it("Camuzzi: total, vencimientos, período y cliente", () => {
    const { extraction, found } = billFromText(CAMUZZI);
    expect(found).toEqual(["monto", "vencimiento", "período", "empresa"]);
    const r = parseBillExtraction(extraction);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      provider: "CAMUZZI",
      billingPeriod: "2026-10",
      dueDate: "2026-11-20",
      secondDueDate: "2026-11-27",
      issueDate: "2026-11-02",
      amountCents: 3_851_240,
      accountNumber: "12345678/9",
    });
  });

  it("EDES: monto en la línea siguiente", () => {
    const r = parseBillExtraction(billFromText(EDES).extraction);
    expect(r.ok && r.value).toMatchObject({ provider: "EDES", billingPeriod: "2026-10", dueDate: "2026-11-28", amountCents: 4_500_000 });
  });

  it("sin datos reconocibles no inventa", () => {
    const { extraction, found } = billFromText("Hola, esto no es una boleta");
    expect(found).toEqual([]);
    expect(parseBillExtraction(extraction).ok).toBe(false);
  });
});

describe("lectura sin IA de recibos", () => {
  it("toma totales y neto", () => {
    const r = parsePayslipExtraction(payslipFromText(RECIBO).extraction);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ period: "2026-10", remunerativeCents: 118_720_000, nonRemunerativeCents: 4_520_000, deductionsCents: 22_480_000, netCents: 100_760_000 });
    expect(r.warnings).toEqual([]);
  });
});
