import type { BillExtraction, PayslipExtraction } from "@/lib/schemas";
import { PROVIDER_NAME } from "@/lib/labels";
import { detectProvider } from "./bill-parser";

/**
 * Lectura SIN IA de boletas y recibos a partir del texto de un PDF digital
 * (los que mandan por mail o se bajan de la web de cada empresa).
 *
 * Busca etiquetas habituales ("Total a pagar", "Vencimiento", "Neto a cobrar", …) y toma
 * el valor que sigue. Es una ayuda: el resultado siempre pasa por la pantalla de revisión.
 * No sirve para fotos ni PDFs escaneados (no tienen texto).
 */

const AMOUNT = String.raw`\$?\s*(-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|-?\d+(?:,\d{1,2}))`;
const DATE = String.raw`(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})`;
const MONTHS = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const PERIOD = String.raw`((?:${MONTHS})(?:\s+de)?\s+\d{4}|\d{1,2}[/-]\d{4}|\d{4}-\d{2})`;

/** Espacios uniformes, sin saltos raros de pdf.js. */
export function cleanText(text: string): string {
  return text.replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/** Primer valor que aparece después de alguna de las etiquetas (en orden de prioridad). */
function after(text: string, labels: string[], value: string, gap = 40): string | null {
  for (const label of labels) {
    const re = new RegExp(String.raw`(?:${label})[^\d$\n]{0,${gap}}?(?:\n[^\d$\n]{0,${gap}})?${value}`, "i");
    const m = re.exec(text);
    if (m) return m[1];
  }
  return null;
}

/** Mayor monto con decimales del texto (último recurso para el total). */
function largestAmount(text: string): string | null {
  let best: { raw: string; v: number } | null = null;
  for (const m of text.matchAll(/\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g)) {
    const v = Number(m[1].replace(/\./g, "").replace(",", "."));
    if (!best || v > best.v) best = { raw: m[1], v };
  }
  return best?.raw ?? null;
}

export function billFromText(raw: string): { extraction: BillExtraction; found: string[] } {
  const text = cleanText(raw);
  const provider = detectProvider(text);
  const monto =
    after(text, ["total a pagar", "importe a pagar", "monto a pagar", "total a abonar", "importe total", "total factura", "saldo a pagar", "total"], AMOUNT) ??
    largestAmount(text);
  const vencimiento = after(text, [String.raw`1\s*[º°er]*\.?\s*vencimiento`, "primer vencimiento", "vencimiento", "vto\\.?", "vence(?:\\s+el)?", "fecha de pago"], DATE);
  const segundo = after(text, [String.raw`2\s*[º°do]*\.?\s*vencimiento`, "segundo vencimiento", String.raw`2\s*[º°do]*\.?\s*vto`], DATE);
  const periodo = after(text, ["per[ií]odo(?: de consumo| facturado)?", "mes de consumo", "mes facturado", "facturaci[oó]n"], PERIOD, 25);
  const emision = after(text, ["fecha de emisi[oó]n", "emisi[oó]n", "emitida(?: el)?"], DATE);
  const cliente = after(text, [String.raw`n[°º]?\s*de\s*cliente`, String.raw`cliente\s*n[°º.]*`, String.raw`nro\.?\s*(?:de\s*)?cliente`, String.raw`n[°º]?\s*de\s*cuenta`, "cuenta"], String.raw`([\d][\d\-/ ]{3,20}\d)`, 10);

  const found = [
    monto && "monto",
    vencimiento && "vencimiento",
    periodo && "período",
    provider !== "OTRO" && "empresa",
  ].filter(Boolean) as string[];

  return {
    found,
    extraction: {
      emisor: provider === "OTRO" ? (text.split("\n")[0] ?? "").slice(0, 80) : PROVIDER_NAME[provider],
      numero_cliente: cliente?.trim() ?? null,
      periodo: periodo ? periodo.replace(/\s+de\s+/i, " ") : null,
      fecha_emision: emision,
      vencimiento,
      segundo_vencimiento: segundo,
      monto: monto ?? "",
      moneda: "ARS",
    },
  };
}

export function payslipFromText(raw: string): { extraction: PayslipExtraction; found: string[] } {
  const text = cleanText(raw);
  const neto = after(text, ["neto a cobrar", "neto a percibir", "total neto", "neto a pagar", "importe neto", "neto"], AMOUNT);
  const rem = after(text, ["total remunerativo", "total haberes con aportes", "haberes con aportes", "total rem\\.?", "remunerativo"], AMOUNT);
  const noRem = after(text, ["total no remunerativo", "total haberes sin aportes", "haberes sin aportes", "total no rem\\.?", "no remunerativo"], AMOUNT);
  const desc = after(text, ["total (?:de )?descuentos", "total (?:de )?deducciones", "total retenciones", "descuentos"], AMOUNT);
  const periodo = after(text, ["per[ií]odo(?: liquidado)?", "mes liquidado", "liquidaci[oó]n(?: correspondiente)?(?: a| al mes de)?", "mes"], PERIOD, 25);
  const pago = after(text, ["fecha de pago", "fecha de dep[oó]sito", "pagado el"], DATE);

  const found = [neto && "neto", periodo && "período", rem && "total remunerativo", desc && "descuentos"].filter(Boolean) as string[];

  return {
    found,
    extraction: {
      empleador: null,
      periodo: periodo ? periodo.replace(/\s+de\s+/i, " ") : null,
      fecha_pago: pago,
      categoria: null,
      haberes: [
        ...(rem ? [{ concepto: "Total remunerativo", monto: rem, remunerativo: true }] : []),
        ...(noRem ? [{ concepto: "Total no remunerativo", monto: noRem, remunerativo: false }] : []),
      ],
      descuentos: desc ? [{ concepto: "Total descuentos", monto: desc.replace("-", "") }] : [],
      total_remunerativo: rem,
      total_no_remunerativo: noRem,
      total_descuentos: desc,
      neto: neto ?? "",
    },
  };
}

/** Texto de un PDF digital (vacío si es escaneado). */
export async function pdfText(data: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
